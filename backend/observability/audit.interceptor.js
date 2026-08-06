const { logAudit } = require("../utils/auditLogger");
const { AUDIT_OUTCOMES } = require("./audit.constants");
const { buildAuditMetadata, buildHttpContext } = require("./audit.metadata");
const { resolveAuditPolicy } = require("./audit.policy");

function auditRequestInterceptor(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    if (req.auditLogged || req.audit?.skip) return;

    const policy = resolveAuditPolicy(req);
    if (!policy) return;

    const durationMs = Date.now() - start;
    const statusCode = res.statusCode;
    const outcome =
      statusCode >= 400 ? AUDIT_OUTCOMES.FAILURE : AUDIT_OUTCOMES.SUCCESS;

    const action = req.audit?.action || policy.action;
    const module = req.audit?.module || policy.module;

    const resource =
      req.audit?.resource ||
      (policy.resourceId
        ? { type: policy.resourceType || "user", id: policy.resourceId }
        : null);

    const extra = { ...(req.audit?.metadata || {}) };
    if (policy.syncType && !extra.type) {
      extra.type = policy.syncType;
    }

    const metadata = buildAuditMetadata({
      event: req.audit?.event || policy.event,
      outcome,
      resource,
      changes: req.audit?.changes ?? null,
      http: buildHttpContext(req, { statusCode, durationMs }),
      extra: Object.keys(extra).length ? extra : null,
    });

    void logAudit({
      userId: req.user?.id ?? null,
      action,
      module,
      req,
      metadata,
    });
  });

  next();
}

module.exports = auditRequestInterceptor;
