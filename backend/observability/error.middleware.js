const AppError = require("../utils/AppError");
const { logger } = require("../config/logger");
const { logAppError } = require("../utils/appErrorLogger");
const { logAudit } = require("../utils/auditLogger");
const env = require("../config/env");
const {
  AUDIT_MODULES,
  AUDIT_ACTIONS,
  AUDIT_OUTCOMES,
  LOGIN_FAILURE_STATUS_CODES,
} = require("./audit.constants");
const { buildAuditMetadata, buildHttpContext } = require("./audit.metadata");
const { isAuthLoginPath } = require("./audit.policy");

async function maybeAuditLoginFailure(err, req, statusCode) {
  if (!LOGIN_FAILURE_STATUS_CODES.has(statusCode)) return;
  if (!isAuthLoginPath(req.originalUrl)) return;

  const provider =
    req.auditLoginProvider ||
    (req.originalUrl?.includes("login-microsoft") ? "microsoft" : "local");

  const metadata = buildAuditMetadata({
    event: "auth.login_failed",
    outcome: AUDIT_OUTCOMES.FAILURE,
    provider,
    reason: err.message || "Falha no login",
    loginHint: req.auditLoginHint || null,
    http: buildHttpContext(req, { statusCode }),
  });

  await logAudit({
    userId: req.auditSubjectUserId ?? null,
    action: AUDIT_ACTIONS.LOGIN_FAILED,
    module: AUDIT_MODULES.AUTH,
    req,
    metadata,
  });
}

function observabilityErrorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const requestId = req.requestId;
  const moduleName = req.route?.path?.includes("auth") ? "auth" : "api";

  if (!(err instanceof AppError) || statusCode >= 500) {
    logger.error({
      err,
      requestId,
      path: req.originalUrl,
      method: req.method,
      userId: req.user?.id,
    });
  } else {
    logger.warn({
      message: err.message,
      requestId,
      path: req.originalUrl,
      statusCode,
    });
  }

  void logAppError({
    req,
    module: moduleName,
    message: err.message || "Erro interno",
    statusCode,
    level: statusCode >= 500 ? "error" : "warn",
    err: statusCode >= 500 ? err : null,
    metadata: err instanceof AppError ? { type: "AppError" } : { type: err.name },
  });

  void maybeAuditLoginFailure(err, req, statusCode);

  const message =
    err instanceof AppError
      ? err.message
      : env.isProduction
        ? "Erro interno."
        : err.message || "Erro interno.";

  res.status(statusCode).json({
    message,
    requestId,
    ...(err instanceof AppError && err.code ? { code: err.code } : {}),
    ...(err instanceof AppError && err.details != null ? { details: err.details } : {}),
    ...(env.isProduction ? {} : err.stack ? { stack: err.stack } : {}),
  });
}

module.exports = observabilityErrorHandler;
