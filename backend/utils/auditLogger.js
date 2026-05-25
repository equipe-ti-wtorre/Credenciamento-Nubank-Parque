const db = require("../config/db");
const { child } = require("../config/logger");
const {
  buildAuditMetadata,
  buildHttpContext,
  truncateMetadata,
} = require("../observability/audit.metadata");

const auditLog = child({ module: "audit" });

function attachAudit(req, { action, module, event, resource, changes, metadata } = {}) {
  if (!req) return;
  if (!req.audit) req.audit = {};
  if (action) req.audit.action = action;
  if (module) req.audit.module = module;
  if (event) req.audit.event = event;
  if (resource) req.audit.resource = resource;
  if (changes != null) req.audit.changes = changes;
  if (metadata && typeof metadata === "object") {
    req.audit.metadata = { ...(req.audit.metadata || {}), ...metadata };
  }
}

function markAuditLogged(req) {
  if (req) req.auditLogged = true;
}

function skipAudit(req) {
  if (!req) return;
  if (!req.audit) req.audit = {};
  req.audit.skip = true;
}

async function logAudit({ userId, action, module, req, metadata = null }) {
  const requestId = req?.requestId || null;
  const clientType = req?.clientType || "web";
  const ip =
    req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req?.ip ||
    req?.socket?.remoteAddress ||
    null;

  let normalized = normalizeAuditPayload(metadata, req);
  normalized = truncateMetadata(normalized);

  auditLog.info({
    userId,
    action,
    module,
    requestId,
    clientType,
    ip,
    metadata: normalized,
  });

  try {
    await db.execute(
      `INSERT INTO audit_logs (user_id, action, module, ip, client_type, request_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        action,
        module,
        ip,
        clientType,
        requestId,
        normalized ? JSON.stringify(normalized) : null,
      ],
    );
  } catch (err) {
    auditLog.error({ err }, "Falha ao gravar audit_logs");
  }
}

function normalizeAuditPayload(metadata, req) {
  if (metadata == null) return null;

  if (metadata.event || metadata.outcome) {
    return truncateMetadata(metadata);
  }

  const event =
    metadata.event ||
    (metadata.module && metadata.action
      ? `${metadata.module}.${String(metadata.action).toLowerCase()}`
      : null);

  return truncateMetadata(
    buildAuditMetadata({
      event,
      outcome: metadata.outcome || "success",
      resource: metadata.resource || null,
      changes: metadata.changes ?? metadata.changesDetail ?? null,
      http: metadata.http || (req ? buildHttpContext(req, { statusCode: 200 }) : null),
      provider: metadata.provider || null,
      reason: metadata.reason || null,
      loginHint: metadata.loginHint || null,
      extra: stripStructuredKeys(metadata),
    }),
  );
}

function stripStructuredKeys(metadata) {
  const {
    event,
    outcome,
    resource,
    changes,
    changesDetail,
    http,
    provider,
    reason,
    loginHint,
    module: _m,
    action: _a,
    ...rest
  } = metadata;
  return Object.keys(rest).length ? rest : null;
}

module.exports = {
  logAudit,
  attachAudit,
  markAuditLogged,
  skipAudit,
};
