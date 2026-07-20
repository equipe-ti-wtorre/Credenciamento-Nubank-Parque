const cron = require("node-cron");
const env = require("../config/env");
const { child } = require("../config/logger");

const logger = child({ module: "approvals-expiration-cron" });

let scheduledTask = null;
let running = false;

async function runApprovalsExpiration({ triggeredBy = "manual" } = {}) {
  if (running) {
    logger.info({ triggeredBy }, "Expiração de aprovações já em andamento — ignorando");
    return { alreadyRunning: true, ok: true, expiredCount: 0 };
  }

  running = true;
  try {
    const approvalsService = require("../modules/approvals/approvals.service");
    const result = await approvalsService.expireOverdueApprovals();
    logger.info({ triggeredBy, ...result }, "Expiração de aprovações concluída");
    return { alreadyRunning: false, ...result };
  } catch (err) {
    logger.error({ err, triggeredBy }, "Erro ao expirar aprovações vencidas");
    return { alreadyRunning: false, ok: false, expiredCount: 0, error: err.message };
  } finally {
    running = false;
  }
}

function startApprovalsExpirationCron() {
  if (!env.approvalsExpirationEnabled) {
    logger.info(
      "Cron de expiração de aprovações desabilitada (APPROVALS_EXPIRATION_ENABLED=false)",
    );
    return null;
  }

  if (!cron.validate(env.approvalsExpirationCron)) {
    logger.error(
      { cron: env.approvalsExpirationCron },
      "Expressão cron inválida para APPROVALS_EXPIRATION_CRON",
    );
    return null;
  }

  if (scheduledTask) {
    scheduledTask.stop();
  }

  // Cobrir janela em que o processo esteve parado.
  runApprovalsExpiration({ triggeredBy: "startup" }).catch((err) => {
    logger.error({ err }, "Falha na expiração de aprovações no startup");
  });

  scheduledTask = cron.schedule(
    env.approvalsExpirationCron,
    async () => {
      logger.info(
        { cron: env.approvalsExpirationCron },
        "Iniciando expiração de aprovações agendada",
      );
      try {
        const result = await runApprovalsExpiration({ triggeredBy: "cron" });
        if (result.alreadyRunning) return;
        if (!result.ok) {
          logger.warn({ result }, "Expiração de aprovações agendada concluída com falhas");
        }
      } catch (err) {
        logger.error({ err }, "Erro na expiração de aprovações agendada");
      }
    },
    { timezone: env.approvalsExpirationTimezone },
  );

  logger.info(
    {
      cron: env.approvalsExpirationCron,
      timezone: env.approvalsExpirationTimezone,
    },
    "Cron de expiração de aprovações registrada",
  );

  return scheduledTask;
}

function stopApprovalsExpirationCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = {
  startApprovalsExpirationCron,
  stopApprovalsExpirationCron,
  runApprovalsExpiration,
};
