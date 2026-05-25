const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../../config/db");
const env = require("../../config/env");
const AppError = require("../../utils/AppError");
const { assertUserCanAccess } = require("../../utils/userDepartment");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateAccessToken(user) {
  const role = user.perfil || user.role || "USER";
  const payload = {
    id: user.id,
    role,
    id_company: user.id_company != null ? user.id_company : null,
  };
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

async function createTokenPair(user, req) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = getRefreshExpiryDate();
  const clientType = req?.clientType || "web";
  const deviceInfo = req?.headers?.["user-agent"] || null;

  await db.execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, client_type, device_info, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [user.id, tokenHash, clientType, deviceInfo, expiresAt],
  );

  return { accessToken, refreshToken };
}

async function refreshAccessToken(refreshToken, req) {
  if (!refreshToken) {
    throw new AppError("Refresh token não fornecido.", 401);
  }

  const tokenHash = hashToken(refreshToken);
  const [rows] = await db.execute(
    `SELECT rt.*, u.id AS uid, u.perfil, u.ativo, u.departamento, u.id_company
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

  assertUserCanAccess({ departamento: row.departamento });

  const user = {
    id: row.user_id,
    perfil: row.perfil,
    id_company: row.id_company != null ? row.id_company : null,
  };
  const accessToken = generateAccessToken(user);
  return { accessToken, user };
}

async function revokeRefreshToken(refreshToken) {
  if (!refreshToken) return;
  const tokenHash = hashToken(refreshToken);
  await db.execute(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL`,
    [tokenHash],
  );
}

async function revokeAllUserTokens(userId) {
  await db.execute(
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
