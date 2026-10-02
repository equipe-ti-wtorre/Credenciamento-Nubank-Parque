const db = require("../../config/db");
const { child } = require("../../config/logger");

const errorLog = child({ module: "app-error" });

const ORIGINS = new Set(["http", "job", "worker", "process", "frontend"]);

function truncate(value, max) {
  if (value == null) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function mergeMetadata(metadata, origin) {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...metadata }
      : metadata != null
        ? { extra: metadata }
        : {};
  if (origin && ORIGINS.has(origin)) {
    base.origin = origin;
  }
  return Object.keys(base).length ? base : null;
}

function resolveIp(req, explicitIp) {
  if (explicitIp) return explicitIp;
  return (
    req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req?.ip ||
    req?.socket?.remoteAddress ||
    null
  );
}

async function logAppError({
  req,
  module = "api",
  message,
  statusCode = 500,
  level,
  userId = null,
  metadata = null,
  err = null,
  origin = null,
  path: explicitPath = null,
  method: explicitMethod = null,
  requestId: explicitRequestId = null,
  clientType: explicitClientType = null,
  ip: explicitIp = null,
  stack: explicitStack = null,
} = {}) {
  const requestId = explicitRequestId || req?.requestId || null;
  const clientType = explicitClientType || req?.clientType || "web";
  const ip = resolveIp(req, explicitIp);
  const path = explicitPath || req?.originalUrl || req?.url || null;
  const method = explicitMethod || req?.method || null;
  const stack = explicitStack || err?.stack || null;
  const resolvedUserId = userId ?? req?.user?.id ?? null;
  const resolvedLevel = level || ((statusCode ?? 500) >= 500 ? "error" : "warn");
  const resolvedOrigin = origin || (req ? "http" : null);
  const resolvedMessage = truncate(message || err?.message || "Erro interno", 500);
  const mergedMeta = mergeMetadata(metadata, resolvedOrigin);
  const pinoLevel = resolvedLevel === "warn" ? "warn" : "error";

  errorLog[pinoLevel]({
    module,
    message: resolvedMessage,
    statusCode,
    requestId,
    path,
    userId: resolvedUserId,
    origin: resolvedOrigin,
  });

  try {
    await db.execute(
      `INSERT INTO app_error_logs
        (level, module, message, status_code, user_id, ip, client_type, request_id, path, method, stack, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        truncate(resolvedLevel, 10),
        truncate(module || "api", 50),
        resolvedMessage,
        statusCode ?? null,
        resolvedUserId,
        ip ? truncate(ip, 45) : null,
        truncate(clientType, 20),
        requestId ? truncate(requestId, 64) : null,
        path ? truncate(path, 255) : null,
        method ? truncate(method, 10) : null,
        stack,
        mergedMeta ? JSON.stringify(mergedMeta) : null,
      ],
    );
  } catch (dbErr) {
    errorLog.error({ err: dbErr }, "Falha ao gravar app_error_logs");
  }
}

module.exports = { logAppError };
