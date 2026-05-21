const { logger } = require("../config/logger");

function deprecationWarning(req, _res, next) {
  logger.warn({
    requestId: req.requestId,
    path: req.originalUrl,
    message: "Rota /api legada — use /api/v1",
  });
  next();
}

module.exports = deprecationWarning;
