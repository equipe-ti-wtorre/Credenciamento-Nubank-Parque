const { logAppError } = require("../utils/appErrorLogger");
const { logAudit } = require("../utils/auditLogger");
const {
  AUDIT_MODULES,
  AUDIT_ACTIONS,
  AUDIT_OUTCOMES,
} = require("./audit.constants");
const { buildAuditMetadata, buildHttpContext } = require("./audit.metadata");

async function recordAuthRateLimit(req, options, { provider }) {
  const statusCode = options?.statusCode ?? 429;

  await Promise.allSettled([
    logAppError({
      req,
      module: "auth",
      message: "Rate limit excedido para autenticação",
      statusCode,
      level: "warn",
      metadata: { type: "RateLimit", provider },
    }),
    logAudit({
      userId: null,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      module: AUDIT_MODULES.AUTH,
      req,
      metadata: buildAuditMetadata({
        event: "auth.login_failed",
        outcome: AUDIT_OUTCOMES.FAILURE,
        provider,
        reason: "Rate limit (429): múltiplas tentativas de login bloqueadas",
        loginHint: req.auditLoginHint ?? null,
        http: buildHttpContext(req, { statusCode }),
        extra: { rateLimit: true },
      }),
    }),
  ]);
}

function resolveRateLimitBody(options, fallbackMessage) {
  const message = options?.message;
  if (typeof message === "object" && message != null && message.message) {
    return message;
  }
  return { message: message || fallbackMessage };
}

function createAuthRateLimitHandler(provider, fallbackMessage) {
  return async (req, res, _next, options) => {
    await recordAuthRateLimit(req, options, { provider });

    const body = resolveRateLimitBody(
      options,
      fallbackMessage || "Muitas tentativas de login. Tente novamente mais tarde.",
    );
    res.status(options?.statusCode ?? 429).json(body);
  };
}

module.exports = {
  recordAuthRateLimit,
  createAuthRateLimitHandler,
  resolveRateLimitBody,
};
