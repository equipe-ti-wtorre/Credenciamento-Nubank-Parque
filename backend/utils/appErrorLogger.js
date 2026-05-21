const db = require("../config/db");
const { child } = require("../config/logger");

const errorLog = child({ module: "app-error" });

async function logAppError({
  req,
  module = "api",
  message,
  statusCode = 500,
  level = "error",
  userId = null,
  metadata = null,
  err = null,
}) {
  const requestId = req?.requestId || null;
  const clientType = req?.clientType || "web";
  const ip =
    req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req?.ip ||
    req?.socket?.remoteAddress ||
    null;
  const path = req?.originalUrl || req?.url || null;
  const method = req?.method || null;
  const stack = err?.stack || null;

  errorLog.error({
    module,
    message,
    statusCode,
    requestId,
    path,
    userId: userId ?? req?.user?.id ?? null,
  });

  try {
    await db.execute(
      `INSERT INTO app_error_logs
        (level, module, message, status_code, user_id, ip, client_type, request_id, path, method, stack, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        level,
        module,
        String(message).slice(0, 500),
        statusCode,
        userId ?? req?.user?.id ?? null,
        ip,
        clientType,
        requestId,
        path ? String(path).slice(0, 255) : null,
        method,
        stack,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
  } catch (dbErr) {
    errorLog.error({ err: dbErr }, "Falha ao gravar app_error_logs");
  }
}

module.exports = { logAppError };
