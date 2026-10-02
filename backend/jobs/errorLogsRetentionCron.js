const cron = require("node-cron");
const env = require("../config/env");
const { child } = require("../config/logger");
const { runErrorLogsRetention } = require("../modules/error-logs/error-logs.retention");
const { captureError } = require("../modules/error-logs/error-logs.helpers");

const logger = child({ module: "error-retention-cron" });

let scheduledTask = null;

function startErrorLogsRetentionCron() {
  if (!env.errorRetentionEnabled) {
    logger.info("Cron de retenção app_error_logs desabilitada (ERROR_RETENTION_ENABLED=false)");
    return null;
  }

  if (!cron.validate(env.errorRetentionCron)) {
    logger.error(
      { cron: env.errorRetentionCron },
      "Expressão cron inválida para ERROR_RETENTION_CRON",
    );
    void captureError(new Error("Expressão cron inválida para ERROR_RETENTION_CRON"), {
      module: "error-retention-cron",
      origin: "job",
      metadata: { cron: env.errorRetentionCron },
    });
    return null;
  }

  if (scheduledTask) {
    scheduledTask.stop();
  }

  scheduledTask = cron.schedule(
    env.errorRetentionCron,
    async () => {
      logger.info({ cron: env.errorRetentionCron }, "Iniciando arquivamento app_error_logs agendado");
      try {
        const result = await runErrorLogsRetention({ triggeredBy: "cron" });
        if (result.alreadyRunning) return;
        if (!result.ok) {
          logger.warn({ result }, "Arquivamento app_error_logs agendado concluído com falhas");
        }
      } catch (err) {
        logger.error({ err }, "Erro no arquivamento app_error_logs agendado");
        void captureError(err, {
          module: "error-retention-cron",
          origin: "job",
          metadata: { triggeredBy: "cron" },
        });
      }
    },
    { timezone: env.errorRetentionTimezone },
  );

  logger.info(
    { cron: env.errorRetentionCron, timezone: env.errorRetentionTimezone },
    "Cron de retenção app_error_logs registrada",
  );

  return scheduledTask;
}

function stopErrorLogsRetentionCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = { startErrorLogsRetentionCron, stopErrorLogsRetentionCron };
