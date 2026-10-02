const { logger } = require("../../config/logger");
const { captureError } = require("./error-logs.helpers");

let registered = false;

function registerProcessErrorHandlers({ processName = "api" } = {}) {
  if (registered) return;
  registered = true;

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error({ err }, "Unhandled rejection");
    void captureError(err, {
      module: processName,
      origin: "process",
      metadata: { type: "unhandledRejection" },
    });
  });

  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    void captureError(err, {
      module: processName,
      origin: "process",
      metadata: { type: "uncaughtException" },
    }).finally(() => {
      process.exit(1);
    });
  });
}

module.exports = { registerProcessErrorHandlers };
