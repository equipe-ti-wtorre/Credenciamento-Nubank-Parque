const cron = require("node-cron");
const env = require("../config/env");
const { child } = require("../config/logger");
const { runAdUsersSync } = require("../utils/adUsersSync");

const logger = child({ module: "ad-users-sync-cron" });

let scheduledTask = null;

function startAdUsersSyncCron() {
  if (!env.adUsersSyncEnabled) {
    logger.info("Cron de sync AD desabilitada (AD_USERS_SYNC_ENABLED=false)");
    return null;
  }

  if (!cron.validate(env.adUsersSyncCron)) {
    logger.error({ cron: env.adUsersSyncCron }, "Expressão cron inválida para AD_USERS_SYNC_CRON");
    return null;
  }

  if (scheduledTask) {
    scheduledTask.stop();
  }

  scheduledTask = cron.schedule(
    env.adUsersSyncCron,
    async () => {
      logger.info({ cron: env.adUsersSyncCron }, "Iniciando sync AD agendada");
      try {
        const result = await runAdUsersSync({ triggeredBy: "cron" });
        if (result.alreadyRunning) return;
        if (!result.ok) {
          logger.warn({ result }, "Sync AD agendada concluída com falhas");
        }
      } catch (err) {
        logger.error({ err }, "Erro na sync AD agendada");
      }
    },
    { timezone: env.adUsersSyncTimezone },
  );

  logger.info(
    { cron: env.adUsersSyncCron, timezone: env.adUsersSyncTimezone },
    "Cron de sync AD registrada",
  );

  return scheduledTask;
}

function stopAdUsersSyncCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = { startAdUsersSyncCron, stopAdUsersSyncCron };
