const axios = require("axios");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const env = require("../../config/env");
const { child } = require("../../config/logger");

const logger = child({ module: "auth-gateway" });
const cfg = env.authGateway;

const REVOKED_POLL_MS = 60_000;
const REVOKED_TIMEOUT_MS = 3_000;

let jwks = null;
let revoked = new Set();
let revokedTimer = null;

function getJwks() {
  if (!jwks) {
    jwks = jwksClient({
      jwksUri: cfg.jwksUrl,
      cache: true,
      cacheMaxAge: 60 * 60 * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      timeout: 5_000,
    });
  }
  return jwks;
}

function getSigningKey(header, callback) {
  getJwks().getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

/** Valida o JWT do gateway: RS256, iss, aud, exp (30 s de tolerância) e lista de encerradas. */
function verifyGatewayToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getSigningKey,
      {
        algorithms: ["RS256"],
        issuer: cfg.url,
        audience: cfg.audience,
        clockTolerance: 30,
      },
      (err, payload) => {
        if (err) return reject(err);
        if (payload.jti && revoked.has(payload.jti)) {
          return reject(new Error("Sessão encerrada no gateway."));
        }
        if (!payload.oid) return reject(new Error("Token do gateway sem oid."));
        resolve(payload);
      },
    );
  });
}

function isRevoked(sid) {
  return !!sid && revoked.has(sid);
}

async function loadRevoked() {
  try {
    const res = await axios.get(cfg.revokedUrl, { timeout: REVOKED_TIMEOUT_MS });
    const sids = res.data?.data?.sids;
    if (Array.isArray(sids)) revoked = new Set(sids);
  } catch (err) {
    // gateway fora do ar: mantém a última lista
    logger.warn({ err: err.message }, "Falha ao ler sessões encerradas do gateway");
  }
}

function startRevokedPoller() {
  if (!cfg.enabled || revokedTimer) return;
  void loadRevoked();
  revokedTimer = setInterval(loadRevoked, REVOKED_POLL_MS);
  revokedTimer.unref();
}

function readGatewayCookie(req) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== cfg.cookieName) continue;
    const value = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return value || null;
    }
  }
  return null;
}

function publicConfig() {
  return { enabled: cfg.enabled, url: cfg.enabled ? cfg.url : null };
}

module.exports = {
  verifyGatewayToken,
  isRevoked,
  startRevokedPoller,
  readGatewayCookie,
  publicConfig,
};
