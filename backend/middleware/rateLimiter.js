const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const env = require("../config/env");
const { createAuthRateLimitHandler } = require("../observability/rateLimit.handler");

function requestPath(req) {
  return (req.originalUrl || req.path || "").split("?")[0];
}

/** IP do cliente (requer app.set('trust proxy', 1) atrás de Nginx/aaPanel). */
function clientKey(req) {
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown");
}

/** Payload JWT sem verificar assinatura — só para particionar o contador. */
function userIdFromAuth(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const raw = Array.isArray(header) ? header[0] : String(header);
  if (!raw.startsWith("Bearer ")) return null;
  const token = raw.slice(7).trim();
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    const payload = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    const id = Number(payload.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function globalKey(req) {
  const userId = userIdFromAuth(req);
  if (userId) return `u:${userId}`;
  return clientKey(req);
}

function isAuthRoute(req) {
  return /^\/api\/(?:v1\/)?auth\/(login|login-microsoft|refresh)(?:\/|$)/.test(requestPath(req));
}

function isHealthRoute(req) {
  const path = requestPath(req);
  return /^\/api\/(?:v1\/)?health(?:\/|$)/.test(path) || path === "/";
}

function isStorageRoute(req) {
  return /^\/api\/(?:v1\/)?storage(?:\/|$)/.test(requestPath(req));
}

/** Gateway facial (`/api/facial`), não a UI admin (`/api/v1/facial`). */
function isFacialGatewayRoute(req) {
  return /^\/api\/facial(?:\/|$)/.test(requestPath(req));
}

function isWebhookRoute(req) {
  return /^\/api\/(?:v1\/)?webhooks(?:\/|$)/.test(requestPath(req));
}

function skipGlobalLimit(req) {
  return (
    isAuthRoute(req) ||
    isHealthRoute(req) ||
    isStorageRoute(req) ||
    isFacialGatewayRoute(req) ||
    isWebhookRoute(req)
  );
}

const noopLimiter = (_req, _res, next) => next();

const limiterOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: clientKey,
};

function buildGlobalLimiter() {
  if (env.rateLimitDisabled) return noopLimiter;

  return rateLimit({
    ...limiterOptions,
    keyGenerator: globalKey,
    windowMs: env.rateLimitGlobalWindowMs,
    max: env.rateLimitGlobalMax,
    message: { message: "Muitas requisições. Tente novamente mais tarde." },
    skip: skipGlobalLimit,
  });
}

function buildAuthLimiter() {
  if (env.rateLimitDisabled) return noopLimiter;

  return rateLimit({
    ...limiterOptions,
    windowMs: env.rateLimitAuthWindowMs,
    max: env.rateLimitAuthMax,
    skipSuccessfulRequests: true,
    message: { message: "Muitas tentativas de login. Tente novamente mais tarde." },
    handler: createAuthRateLimitHandler(
      "local",
      "Muitas tentativas de login. Tente novamente mais tarde.",
    ),
  });
}

function buildMicrosoftAuthLimiter() {
  if (env.rateLimitDisabled) return noopLimiter;

  return rateLimit({
    ...limiterOptions,
    windowMs: env.rateLimitAuthWindowMs,
    max: env.rateLimitMicrosoftAuthMax,
    skipSuccessfulRequests: true,
    message: {
      message: "Muitas tentativas de login Microsoft. Aguarde alguns minutos.",
    },
    handler: createAuthRateLimitHandler(
      "microsoft",
      "Muitas tentativas de login Microsoft. Aguarde alguns minutos.",
    ),
  });
}

const globalLimiter = buildGlobalLimiter();
const authLimiter = buildAuthLimiter();
const microsoftAuthLimiter = buildMicrosoftAuthLimiter();

module.exports = {
  globalLimiter,
  authLimiter,
  microsoftAuthLimiter,
  clientKey,
  globalKey,
  isAuthRoute,
  skipGlobalLimit,
};
