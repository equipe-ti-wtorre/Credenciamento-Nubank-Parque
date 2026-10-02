const { logAppError } = require("./error-logs.service");

function normalizeErr(err) {
  if (err instanceof Error) return err;
  if (err == null) return new Error("Erro desconhecido");
  if (typeof err === "string") return new Error(err);
  const wrapped = new Error(err.message || String(err));
  if (err.stack) wrapped.stack = err.stack;
  return wrapped;
}

async function captureError(err, ctx = {}) {
  const error = normalizeErr(err);
  const statusCode = ctx.statusCode ?? error.statusCode ?? 500;
  await logAppError({
    req: ctx.req,
    module: ctx.module || "api",
    message: ctx.message || error.message,
    statusCode,
    level: ctx.level || (statusCode >= 500 ? "error" : "warn"),
    userId: ctx.userId ?? null,
    metadata: ctx.metadata || null,
    err: error,
    origin: ctx.origin || null,
    path: ctx.path,
    method: ctx.method,
    requestId: ctx.requestId,
    clientType: ctx.clientType,
    ip: ctx.ip,
    stack: ctx.stack,
  });
}

function safeJob(fn, ctx = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      await captureError(err, ctx);
      throw err;
    }
  };
}

module.exports = { captureError, safeJob, normalizeErr };
