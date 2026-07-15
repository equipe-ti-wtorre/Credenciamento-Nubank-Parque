const bcrypt = require("bcryptjs");
const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { decrypt } = require("../../config/cryptoSecrets");
const {
  fetchUserPhotoBuffer,
} = require("../../utils/microsoftGraph");
const { fetchMicrosoftProfile } = require("../../utils/userProfileSync");
const { assertUserCanAccess, hasValidDepartment, DEPARTMENT_REQUIRED_MESSAGE } = require("../../utils/userDepartment");
const { createTokenPair } = require("./token.service");
const { setAuditLoginContext } = require("../../observability/audit.auth");
const profilesService = require("../profiles/profiles.service");

async function mapUserResponse(user) {
  const ctx = await profilesService.loadUserProfileContext(user.id);
  return {
    id: user.id,
    username: user.username,
    nome_completo: user.nome_completo,
    email: user.email,
    role: ctx?.codigo || "USER",
    perfil: ctx?.codigo || "USER",
    id_perfil: ctx?.id_perfil || user.id_perfil || null,
    profile: ctx
      ? {
          id: ctx.id_perfil,
          codigo: ctx.codigo,
          nome: ctx.perfil_nome,
          requires_company: ctx.requires_company,
          is_super_admin: ctx.is_super_admin,
        }
      : null,
    permissions: ctx?.permissions || [],
    id_company: user.id_company != null ? user.id_company : null,
    is_ad_user: !!user.is_ad_user,
    session_idle_minutes:
      user.session_idle_minutes != null ? user.session_idle_minutes : null,
  };
}

async function enrichUserResponse(user) {
  const sectorsService = require("../sectors/sectors.service");
  const sectorMemberships = await sectorsService.listSectorMemberships(user.id);
  const mapped = await mapUserResponse(user);
  return { ...mapped, sectorMemberships };
}

async function buildAuthResponse(tokens, user) {
  return {
    auth: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    token: tokens.accessToken,
    user: await enrichUserResponse(user),
  };
}

async function loginLocal(username, password, req) {
  setAuditLoginContext(req, { provider: "local", loginHint: username });

  const [users] = await db.execute(
    `SELECT * FROM usuarios WHERE (username = ? OR email = ?) AND ativo = 1 LIMIT 1`,
    [username, username],
  );
  const user = users[0];
  if (!user) throw new AppError("Usuário não encontrado.", 401);
  if (user.is_ad_user === 1 && !user.senha_hash) {
    throw new AppError('Use "Entrar com Microsoft".', 400);
  }
  if (!user.senha_hash) throw new AppError("Senha não definida.", 401);

  const senhaValida = await bcrypt.compare(password, user.senha_hash);
  if (!senhaValida) {
    setAuditLoginContext(req, {
      provider: "local",
      userId: user.id,
      loginHint: username,
    });
    throw new AppError("Senha incorreta.", 401);
  }

  try {
    assertUserCanAccess(user);
  } catch (err) {
    setAuditLoginContext(req, { provider: "local", userId: user.id, loginHint: username });
    throw err;
  }

  const tokens = await createTokenPair(user, req);
  return await buildAuthResponse(tokens, user);
}

async function loginMicrosoft(azureUser, req) {
  setAuditLoginContext(req, { provider: "microsoft" });

  const oid = azureUser.oid;
  const email =
    azureUser.preferred_username ||
    azureUser.upn ||
    azureUser.email ||
    azureUser.unique_name ||
    null;
  const nome = azureUser.name || azureUser.displayName;
  if (!oid) {
    throw new AppError("Dados não retornados pela Microsoft.", 400);
  }

  setAuditLoginContext(req, { provider: "microsoft", loginHint: email || oid });

  let userLocal = null;
  const [byOid] = await db.execute(
    "SELECT * FROM usuarios WHERE microsoft_id = ? LIMIT 1",
    [oid],
  );
  if (byOid.length > 0) userLocal = byOid[0];

  // Token Teams SSO pode não trazer e-mail — usuário já vinculado por microsoft_id.
  if (userLocal && userLocal.ativo) {
    try {
      assertUserCanAccess(userLocal);
    } catch (err) {
      setAuditLoginContext(req, {
        provider: "microsoft",
        userId: userLocal.id,
        loginHint: email || oid,
      });
      throw err;
    }
    const tokens = await createTokenPair(userLocal, req);
    return await buildAuthResponse(tokens, userLocal);
  }

  if (!email) {
    throw new AppError(
      "Token Microsoft sem e-mail. Faça login uma vez pelo navegador ou sincronize o usuário do AD.",
      400,
    );
  }

  const graphProfile = await fetchMicrosoftProfile(oid, azureUser.tid || null);
  if (!graphProfile.ok || !hasValidDepartment(graphProfile.departamento)) {
    throw new AppError(DEPARTMENT_REQUIRED_MESSAGE, 403);
  }

  const departamento = graphProfile.departamento;
  const nomeCompleto = graphProfile.displayName || nome || email.split("@")[0];
  const defaultProfile = await profilesService.getProfileByCodigo("USER");
  const defaultProfileId = defaultProfile?.id || null;

  if (!userLocal) {
    const [byEmail] = await db.execute(
      "SELECT * FROM usuarios WHERE email = ? LIMIT 1",
      [email],
    );
    if (byEmail.length > 0) {
      userLocal = byEmail[0];
      await db.execute(
        `UPDATE usuarios SET microsoft_id = ?, is_ad_user = 1, departamento = ?, nome_completo = ? WHERE id = ?`,
        [oid, departamento, nomeCompleto, userLocal.id],
      );
    }
  }

  if (!userLocal) {
    const username = email.split("@")[0];
    const [result] = await db.execute(
      `INSERT INTO usuarios (username, nome_completo, email, departamento, is_ad_user, senha_hash, id_perfil, ativo, microsoft_id)
       VALUES (?, ?, ?, ?, 1, NULL, ?, 1, ?)`,
      [username, nomeCompleto, email, departamento, defaultProfileId, oid],
    );
    const [newUsers] = await db.execute("SELECT * FROM usuarios WHERE id = ?", [
      result.insertId,
    ]);
    userLocal = newUsers[0];
  } else {
    await db.execute(
      `UPDATE usuarios SET departamento = ?, nome_completo = COALESCE(?, nome_completo) WHERE id = ?`,
      [departamento, nomeCompleto, userLocal.id],
    );
    const [refreshed] = await db.execute("SELECT * FROM usuarios WHERE id = ? LIMIT 1", [
      userLocal.id,
    ]);
    if (refreshed[0]) userLocal = refreshed[0];
  }

  if (!userLocal.ativo) {
    setAuditLoginContext(req, { provider: "microsoft", userId: userLocal.id, loginHint: email });
    throw new AppError("Usuário inativo.", 403);
  }

  try {
    assertUserCanAccess(userLocal);
  } catch (err) {
    setAuditLoginContext(req, { provider: "microsoft", userId: userLocal.id, loginHint: email });
    throw err;
  }

  const tokens = await createTokenPair(userLocal, req);
  return await buildAuthResponse(tokens, userLocal);
}

async function getMe(userId) {
  const [users] = await db.execute(
    "SELECT * FROM usuarios WHERE id = ? AND ativo = 1 LIMIT 1",
    [userId],
  );
  const user = users[0];
  if (!user) throw new AppError("Usuário não encontrado.", 404);
  assertUserCanAccess(user);
  return enrichUserResponse(user);
}

async function getProfilePhoto(userId) {
  const [users] = await db.execute(
    "SELECT * FROM usuarios WHERE id = ? AND ativo = 1 LIMIT 1",
    [userId],
  );
  const user = users[0];
  if (!user) throw new AppError("Usuário não encontrado.", 404);
  if (!user.is_ad_user || !user.microsoft_id) {
    throw new AppError("Foto de perfil não disponível.", 404);
  }

  const [tenants] = await db.execute(
    `SELECT azure_tenant_id, client_id, client_secret_ciphertext
     FROM azure_tenants
     WHERE ativo = 1 AND client_secret_ciphertext IS NOT NULL
     ORDER BY eh_principal DESC, id ASC`,
  );

  for (const tenant of tenants) {
    let clientSecret;
    try {
      clientSecret = decrypt(tenant.client_secret_ciphertext);
    } catch {
      continue;
    }
    if (!clientSecret) continue;

    const photo = await fetchUserPhotoBuffer(
      tenant.azure_tenant_id,
      tenant.client_id,
      clientSecret,
      user.microsoft_id,
    );
    if (photo) return photo;
  }

  throw new AppError("Foto de perfil não encontrada no Microsoft 365.", 404);
}

module.exports = {
  mapUserResponse,
  buildAuthResponse,
  loginLocal,
  loginMicrosoft,
  getMe,
  getProfilePhoto,
};
