const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../../config/db");
const env = require("../../config/env");
const AppError = require("../../utils/AppError");
const { assertUserCanAccess } = require("../../utils/userDepartment");
const profilesService = require("../profiles/profiles.service");
const { isRevoked: isGatewaySessionRevoked } = require("./gateway.service");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function generateAccessToken(user, gatewaySid = null) {
  const ctx = await profilesService.loadUserProfileContext(user.id);
  const role = ctx?.codigo || user.role || "USER";
  const payload = {
    id: user.id,
    role,
    id_perfil: ctx?.id_perfil || user.id_perfil || null,
    id_company: user.id_company != null ? user.id_company : null,
  };
  if (gatewaySid) payload.gw_sid = gatewaySid;
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtAccessExpires,
  });
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

function getRefreshExpiryDate() {
  const match = String(env.jwtRefreshExpires).match(/^(\d+)([dhms])$/);
  if (!match) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const d = new Date();
  if (unit === "d") d.setDate(d.getDate() + amount);
  else if (unit === "h") d.setHours(d.getHours() + amount);
  else if (unit === "m") d.setMinutes(d.getMinutes() + amount);
  else d.setSeconds(d.getSeconds() + amount);
  return d;
}

/**
 * `gatewaySid` / `gatewayExp` (segundos): sessão do auth-gateway. O refresh não passa do fim dela
 * e é recusado se o gateway encerrar a sessão.
 */
async function createTokenPair(user, req, { gatewaySid = null, gatewayExp = null } = {}) {
  const accessToken = await generateAccessToken(user, gatewaySid);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  let expiresAt = getRefreshExpiryDate();
  if (gatewayExp) {
    const gatewayEnd = new Date(gatewayExp * 1000);
    if (gatewayEnd < expiresAt) expiresAt = gatewayEnd;
  }
  const clientType = req?.clientType || "web";
  const deviceInfo = req?.headers?.["user-agent"] || null;

  await db.execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, client_type, device_info, gateway_sid, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user.id, tokenHash, clientType, deviceInfo, gatewaySid, expiresAt],
  );

  return { accessToken, refreshToken };
}

async function refreshAccessToken(refreshToken, req) {
  if (!refreshToken) {
    throw new AppError("Refresh token não fornecido.", 401);
  }

  const tokenHash = hashToken(refreshToken);
  const [rows] = await db.execute(
    `SELECT rt.*, u.id AS uid, u.ativo, u.departamento, u.id_company, u.id_perfil
     FROM refresh_tokens rt
     JOIN usuarios u ON u.id = rt.user_id
     WHERE rt.token_hash = ? AND rt.revoked_at IS NULL AND rt.expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );

  const row = rows[0];
  if (!row) {
    throw new AppError("Refresh token inválido ou expirado.", 401);
  }
  if (!row.ativo) {
    throw new AppError("Usuário inativo.", 403);
  }
  if (row.gateway_sid && isGatewaySessionRevoked(row.gateway_sid)) {
    throw new AppError("Sua sessão foi encerrada. Entre novamente.", 401);
  }

  assertUserCanAccess({ departamento: row.departamento });

  const user = {
    id: row.user_id,
    id_perfil: row.id_perfil,
    id_company: row.id_company != null ? row.id_company : null,
  };
  const accessToken = await generateAccessToken(user, row.gateway_sid || null);
  const ctx = await profilesService.loadUserProfileContext(user.id);
  return {
    accessToken,
    user: {
      ...user,
      role: ctx?.codigo || "USER",
      perfil: ctx?.codigo || "USER",
    },
  };
}

async function revokeRefreshToken(refreshToken) {
  if (!refreshToken) return;
  const tokenHash = hashToken(refreshToken);
  await db.execute(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL`,
    [tokenHash],
  );
}

async function revokeAllUserTokens(userId, conn = db) {
  await conn.execute(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`,
    [userId],
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = {
  generateAccessToken,
  createTokenPair,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  verifyAccessToken,
  hashToken,
};
