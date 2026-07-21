const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const env = require("../config/env");
const { createAuthRateLimitHandler } = require("../observability/rateLimit.handler");

/** IP do cliente (requer app.set('trust proxy', 1) atrás de Nginx/aaPanel). */
function clientKey(req) {
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown");
}

function isAuthRoute(req) {
  const path = (req.originalUrl || req.path || "").split("?")[0];
  return /^\/api\/(?:v1\/)?auth\/(login|login-microsoft|refresh)(?:\/|$)/.test(path);
}

function isHealthRoute(req) {
  const path = (req.originalUrl || req.path || "").split("?")[0];
  return /^\/api\/(?:v1\/)?health(?:\/|$)/.test(path) || path === "/";
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
    windowMs: env.rateLimitGlobalWindowMs,
    max: env.rateLimitGlobalMax,
    message: { message: "Muitas requisições. Tente novamente mais tarde." },
    skip: (req) => isAuthRoute(req) || isHealthRoute(req),
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

module.exports = { globalLimiter, authLimiter, microsoftAuthLimiter, clientKey, isAuthRoute };
