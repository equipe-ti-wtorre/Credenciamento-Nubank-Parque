const bcrypt = require("bcryptjs");
const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { decrypt } = require("../../config/cryptoSecrets");
const { fetchUserPhotoBuffer } = require("../../utils/microsoftGraph");
const { createTokenPair } = require("./token.service");

function mapUserResponse(user) {
  return {
    id: user.id,
    username: user.username,
    nome_completo: user.nome_completo,
    email: user.email,
    role: user.perfil,
    is_ad_user: !!user.is_ad_user,
  };
}

function buildAuthResponse(tokens, user) {
  return {
    auth: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    token: tokens.accessToken,
    user: mapUserResponse(user),
  };
}

async function loginLocal(username, password, req) {
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
  if (!senhaValida) throw new AppError("Senha incorreta.", 401);

  const tokens = await createTokenPair(user, req);
  return buildAuthResponse(tokens, user);
}

async function loginMicrosoft(azureUser, req) {
  const oid = azureUser.oid;
  const email = azureUser.preferred_username || azureUser.upn || azureUser.email;
  const nome = azureUser.name || azureUser.displayName;
  if (!oid || !email) {
    throw new AppError("Dados não retornados pela Microsoft.", 400);
  }

  let userLocal = null;
  const [byOid] = await db.execute(
    "SELECT * FROM usuarios WHERE microsoft_id = ? LIMIT 1",
    [oid],
  );
  if (byOid.length > 0) userLocal = byOid[0];

  if (!userLocal) {
    const [byEmail] = await db.execute(
      "SELECT * FROM usuarios WHERE email = ? LIMIT 1",
      [email],
    );
    if (byEmail.length > 0) {
      userLocal = byEmail[0];
      await db.execute(
        "UPDATE usuarios SET microsoft_id = ?, is_ad_user = 1 WHERE id = ?",
        [oid, userLocal.id],
      );
    }
  }

  if (!userLocal) {
    const username = email.split("@")[0];
    const [result] = await db.execute(
      `INSERT INTO usuarios (username, nome_completo, email, is_ad_user, senha_hash, perfil, ativo, microsoft_id)
       VALUES (?, ?, ?, 1, NULL, 'USER', 1, ?)`,
      [username, nome || username, email, oid],
    );
    const [newUsers] = await db.execute("SELECT * FROM usuarios WHERE id = ?", [
      result.insertId,
    ]);
    userLocal = newUsers[0];
  }

  if (!userLocal.ativo) throw new AppError("Usuário inativo.", 403);

  const tokens = await createTokenPair(userLocal, req);
  return buildAuthResponse(tokens, userLocal);
}

async function getMe(userId) {
  const [users] = await db.execute(
    "SELECT * FROM usuarios WHERE id = ? AND ativo = 1 LIMIT 1",
    [userId],
  );
  const user = users[0];
  if (!user) throw new AppError("Usuário não encontrado.", 404);
  return mapUserResponse(user);
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
