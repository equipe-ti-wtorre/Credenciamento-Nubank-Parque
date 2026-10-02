const { clientErrorSchema } = require("./error-logs.schema");
const { logAppError } = require("./error-logs.service");
const { verifyAccessToken } = require("../auth/token.service");

function optionalUserId(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const raw = Array.isArray(header) ? header[0] : String(header);
  if (!raw.startsWith("Bearer ")) return null;
  try {
    const decoded = verifyAccessToken(raw.slice(7).trim());
    const id = Number(decoded?.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

exports.reportClient = async (req, res) => {
  const { error, value } = clientErrorSchema.validate(req.body || {}, {
    abortEarly: true,
    stripUnknown: true,
  });

  if (!error) {
    void logAppError({
      req,
      module: "frontend",
      origin: "frontend",
      message: value.message,
      statusCode: null,
      level: "error",
      userId: optionalUserId(req),
      path: value.path || null,
      requestId: value.requestId || req.requestId,
      clientType: value.clientType || req.clientType || "web",
      stack: value.stack || null,
      metadata: {
        type: "ClientError",
        userAgent: value.userAgent || req.headers["user-agent"] || null,
      },
    });
  }

  return res.status(204).end();
};
