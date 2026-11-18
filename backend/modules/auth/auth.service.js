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
const { logAudit } = require("../../utils/auditLogger");
const { AUDIT_MODULES, AUDIT_ACTIONS } = require("../../observability/audit.constants");

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
    requires_company: !!ctx?.requires_company,
    is_super_admin: !!ctx?.is_super_admin,
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
  const credentialsError = () =>
    new AppError("Usuário ou senha inválidos.", 401);

  if (!user) throw credentialsError();
  // Conta do Entra entra só pelo login corporativo (auth-gateway), nunca por senha.
  if (Number(user.is_ad_user) === 1) {
    throw new AppError('Conta corporativa: use "Entrar com Microsoft".', 400);
  }
  if (!user.senha_hash) throw credentialsError();

  const senhaValida = await bcrypt.compare(password, user.senha_hash);
  if (!senhaValida) {
    setAuditLoginContext(req, {
      provider: "local",
      userId: user.id,
      loginHint: username,
    });
    throw credentialsError();
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

  const email =
    azureUser.preferred_username ||
    azureUser.upn ||
    azureUser.email ||
    azureUser.unique_name ||
    null;
  const userLocal = await resolveMicrosoftUser(
    {
      oid: azureUser.oid,
      email,
      nome: azureUser.name || azureUser.displayName,
      tid: azureUser.tid || null,
    },
    req,
    "microsoft",
  );
  const tokens = await createTokenPair(userLocal, req);
  return await buildAuthResponse(tokens, userLocal);
}

const seenGatewaySessions = new Set();

/** Registra o login uma vez por sessão do gateway (jti), no 1º uso da API. */
function noteGatewayLogin(payload, user, req) {
  const key = payload.jti || `${payload.oid}:${payload.iat}`;
  if (seenGatewaySessions.has(key)) return;
  if (seenGatewaySessions.size > 5000) seenGatewaySessions.clear();
  seenGatewaySessions.add(key);
  Promise.resolve(
    logAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN_MICROSOFT,
      module: AUDIT_MODULES.AUTH,
      req,
      metadata: { event: "auth.login_gateway", outcome: "success", provider: "gateway" },
    }),
  ).catch(() => undefined);
}

/**
 * Usuário da sessão do auth-gateway (payload já validado), pelo oid. No 1º acesso cria o usuário
 * sem perfil, pelo mesmo caminho do login Microsoft (departamento obrigatório).
 */
async function resolveGatewayUser(payload, req) {
  const findByOid = async () => {
    const [rows] = await db.execute(
      "SELECT id, ativo FROM usuarios WHERE microsoft_id = ? LIMIT 1",
      [payload.oid],
    );
    return rows[0] || null;
  };
  let user = await findByOid();
  if (!user) {
    try {
      user = await resolveMicrosoftUser(
        {
          oid: payload.oid,
          email: payload.email || payload.sub || null,
          nome: payload.name,
          tid: payload.tid || null,
        },
        req,
        "gateway",
      );
    } catch (err) {
      // Várias chamadas simultâneas no 1º acesso: só uma insere.
      if (err.code !== "ER_DUP_ENTRY") throw err;
      user = await findByOid();
      if (!user) throw err;
    }
  }
  noteGatewayLogin(payload, user, req);
  return user;
}

/**
 * Localiza o usuário pelo oid (microsoft_id); senão vincula por e-mail ou cria com perfil USER.
 * O e-mail de usuários já existentes não é sobrescrito (notificações Teams usam o e-mail).
 */
async function resolveMicrosoftUser({ oid, email, nome, tid }, req, provider) {
  if (!oid) {
    throw new AppError("Dados não retornados pela Microsoft.", 400);
  }

  setAuditLoginContext(req, { provider, loginHint: email || oid });

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
        provider,
        userId: userLocal.id,
        loginHint: email || oid,
      });
      throw err;
    }
    return userLocal;
  }

  if (!email) {
    throw new AppError(
      "Token Microsoft sem e-mail. Faça login uma vez pelo navegador ou sincronize o usuário do AD.",
      400,
    );
  }

  const graphProfile = await fetchMicrosoftProfile(oid, tid || null);
  if (!graphProfile.ok || !hasValidDepartment(graphProfile.departamento)) {
    throw new AppError(DEPARTMENT_REQUIRED_MESSAGE, 403);
  }

  const departamento = graphProfile.departamento;
  const nomeCompleto = graphProfile.displayName || nome || email.split("@")[0];
  // 1º acesso entra sem perfil ("aguardando liberação"); o administrador do sistema define o perfil.
  const defaultProfileId = null;

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
    setAuditLoginContext(req, { provider, userId: userLocal.id, loginHint: email });
    throw new AppError("Usuário inativo.", 403);
  }

  try {
    assertUserCanAccess(userLocal);
  } catch (err) {
    setAuditLoginContext(req, { provider, userId: userLocal.id, loginHint: email });
    throw err;
  }

  return userLocal;
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
  resolveGatewayUser,
  getMe,
  getProfilePhoto,
};
