const { maskLoginHint } = require("./audit.metadata");

function setAuditLoginContext(req, { provider, userId = null, loginHint = null } = {}) {
  if (!req) return;
  if (provider) req.auditLoginProvider = provider;
  if (userId != null) req.auditSubjectUserId = userId;
  if (loginHint != null) req.auditLoginHint = maskLoginHint(loginHint);
}

module.exports = { setAuditLoginContext };
