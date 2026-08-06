const { logger } = require("../config/logger");

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    logger[level]({
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      clientType: req.clientType,
      userId: req.user?.id,
    });
  });
  next();
}

module.exports = requestLogger;
