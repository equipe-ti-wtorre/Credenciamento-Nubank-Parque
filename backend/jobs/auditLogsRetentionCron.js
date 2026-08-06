const cron = require("node-cron");
const env = require("../config/env");
const { child } = require("../config/logger");
const { runAuditLogsRetention } = require("../observability/audit.retention");

const logger = child({ module: "audit-retention-cron" });

let scheduledTask = null;

function startAuditLogsRetentionCron() {
  if (!env.auditRetentionEnabled) {
    logger.info("Cron de retenção audit_logs desabilitada (AUDIT_RETENTION_ENABLED=false)");
    return null;
  }

  if (!cron.validate(env.auditRetentionCron)) {
    logger.error(
      { cron: env.auditRetentionCron },
      "Expressão cron inválida para AUDIT_RETENTION_CRON",
    );
    return null;
  }

  if (scheduledTask) {
    scheduledTask.stop();
  }

  scheduledTask = cron.schedule(
    env.auditRetentionCron,
    async () => {
      logger.info({ cron: env.auditRetentionCron }, "Iniciando arquivamento audit_logs agendado");
      try {
        const result = await runAuditLogsRetention({ triggeredBy: "cron" });
        if (result.alreadyRunning) return;
        if (!result.ok) {
          logger.warn({ result }, "Arquivamento audit_logs agendado concluído com falhas");
        }
      } catch (err) {
        logger.error({ err }, "Erro no arquivamento audit_logs agendado");
      }
    },
    { timezone: env.auditRetentionTimezone },
  );

  logger.info(
    { cron: env.auditRetentionCron, timezone: env.auditRetentionTimezone },
    "Cron de retenção audit_logs registrada",
  );

  return scheduledTask;
}

function stopAuditLogsRetentionCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = { startAuditLogsRetentionCron, stopAuditLogsRetentionCron };
