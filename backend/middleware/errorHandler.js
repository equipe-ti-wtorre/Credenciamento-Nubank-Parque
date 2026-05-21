const AppError = require("../utils/AppError");
const { logger } = require("../config/logger");
const { logAppError } = require("../utils/appErrorLogger");
const env = require("../config/env");

function errorHandler(err, req, res, _next) {
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

  const message =
    err instanceof AppError
      ? err.message
      : env.isProduction
        ? "Erro interno."
        : err.message || "Erro interno.";

  res.status(statusCode).json({
    message,
    requestId,
    ...(env.isProduction ? {} : err.stack ? { stack: err.stack } : {}),
  });
}

module.exports = errorHandler;
