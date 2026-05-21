const db = require("../config/db");
const { child } = require("../config/logger");

const auditLog = child({ module: "audit" });

async function logAudit({ userId, action, module, req, metadata = null }) {
  const requestId = req?.requestId || null;
  const clientType = req?.clientType || "web";
  const ip =
    req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req?.ip ||
    req?.socket?.remoteAddress ||
    null;

  auditLog.info({
    userId,
    action,
    module,
    requestId,
    clientType,
    ip,
    metadata,
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
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
  } catch (err) {
    auditLog.error({ err }, "Falha ao gravar audit_logs");
  }
}

module.exports = { logAudit };
