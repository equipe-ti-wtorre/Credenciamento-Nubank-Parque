const cron = require("node-cron");
const env = require("../config/env");
const { child } = require("../config/logger");
const { runAdUsersSync } = require("../utils/adUsersSync");
const { captureError } = require("../modules/error-logs/error-logs.helpers");

const logger = child({ module: "ad-users-sync-cron" });

let scheduledTask = null;

async function runAdUsersSyncCron({ triggeredBy = "manual" } = {}) {
  try {
    const result = await runAdUsersSync({ triggeredBy });
    if (result.alreadyRunning) {
      logger.info({ triggeredBy }, "Sync AD já em execução — ignorando");
    }
    return result;
  } catch (err) {
    logger.error({ err, triggeredBy }, "Erro ao sincronizar usuários do AD");
    await captureError(err, {
      module: "ad-users-sync-cron",
      origin: "job",
      metadata: { triggeredBy },
    });
    return { alreadyRunning: false, ok: false, error: err.message };
  }
}

function startAdUsersSyncCron() {
  if (!env.adUsersSyncEnabled) {
    logger.info("Cron de sync AD desabilitada (AD_USERS_SYNC_ENABLED=false)");
    return null;
  }

  if (!cron.validate(env.adUsersSyncCron)) {
    logger.error({ cron: env.adUsersSyncCron }, "Expressão cron inválida para AD_USERS_SYNC_CRON");
    void captureError(new Error("Expressão cron inválida para AD_USERS_SYNC_CRON"), {
      module: "ad-users-sync-cron",
      origin: "job",
      metadata: { cron: env.adUsersSyncCron },
    });
    return null;
  }

  if (scheduledTask) {
    scheduledTask.stop();
  }

  // Cobrir janela em que o processo esteve parado.
  runAdUsersSyncCron({ triggeredBy: "startup" }).catch((err) => {
    logger.error({ err }, "Falha na sync AD no startup");
    void captureError(err, {
      module: "ad-users-sync-cron",
      origin: "job",
      metadata: { triggeredBy: "startup" },
    });
  });

  scheduledTask = cron.schedule(
    env.adUsersSyncCron,
    async () => {
      logger.info({ cron: env.adUsersSyncCron }, "Iniciando sync AD agendada");
      try {
        const result = await runAdUsersSyncCron({ triggeredBy: "cron" });
        if (result.alreadyRunning) return;
        if (!result.ok) {
          logger.warn({ result }, "Sync AD agendada concluída com falhas");
        }
      } catch (err) {
        logger.error({ err }, "Erro na sync AD agendada");
        void captureError(err, {
          module: "ad-users-sync-cron",
          origin: "job",
          metadata: { triggeredBy: "cron" },
        });
      }
    },
    { timezone: env.adUsersSyncTimezone },
  );

  logger.info(
    { cron: env.adUsersSyncCron, timezone: env.adUsersSyncTimezone },
    "Cron de sync AD registrada (intervalo de 1 hora)",
  );

  return scheduledTask;
}

function stopAdUsersSyncCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = { startAdUsersSyncCron, stopAdUsersSyncCron, runAdUsersSyncCron };
