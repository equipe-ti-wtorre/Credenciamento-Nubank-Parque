const { randomUUID } = require("crypto");

function requestIdMiddleware(req, res, next) {
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && incoming.trim() ? incoming.trim() : randomUUID();
  req.requestId = requestId;
  req.clientType = (req.headers["x-client-type"] || "web").toString().toLowerCase();
  res.setHeader("X-Request-Id", requestId);
  next();
}

module.exports = requestIdMiddleware;
