const cron = require("node-cron");
const env = require("../config/env");
const { child } = require("../config/logger");
const { captureError } = require("../modules/error-logs/error-logs.helpers");

const logger = child({ module: "event-accreditation-invite-cron" });

let scheduledTask = null;
let running = false;

async function runEventAccreditationInvites({ triggeredBy = "manual" } = {}) {
  if (running) {
    logger.info({ triggeredBy }, "Disparo de convites já em andamento — ignorando");
    return { alreadyRunning: true, ok: true, sent: 0 };
  }

  running = true;
  try {
    const service = require("../modules/event-accreditation/event-accreditation.service");
    const result = await service.dispatchDueInvites();
    if (result.total) {
      logger.info({ triggeredBy, ...result }, "Disparo de convites de credenciamento concluído");
    }
    return { alreadyRunning: false, ...result };
  } catch (err) {
    logger.error({ err, triggeredBy }, "Erro ao disparar convites de credenciamento");
    await captureError(err, {
      module: "event-accreditation-invite-cron",
      origin: "job",
      metadata: { triggeredBy },
    });
    return { alreadyRunning: false, ok: false, sent: 0, error: err.message };
  } finally {
    running = false;
  }
}

function startEventAccreditationInviteCron() {
  if (!env.eventAccreditationInviteEnabled) {
    logger.info(
      "Cron de convites de credenciamento desabilitada (EVENT_ACCREDITATION_INVITE_ENABLED=false)",
    );
    return null;
  }

  if (!cron.validate(env.eventAccreditationInviteCron)) {
    logger.error(
      { cron: env.eventAccreditationInviteCron },
      "Expressão cron inválida para EVENT_ACCREDITATION_INVITE_CRON",
    );
    void captureError(new Error("Expressão cron inválida para EVENT_ACCREDITATION_INVITE_CRON"), {
      module: "event-accreditation-invite-cron",
      origin: "job",
      metadata: { cron: env.eventAccreditationInviteCron },
    });
    return null;
  }

  if (scheduledTask) {
    scheduledTask.stop();
  }

  runEventAccreditationInvites({ triggeredBy: "startup" }).catch((err) => {
    logger.error({ err }, "Falha no disparo de convites de credenciamento no startup");
    void captureError(err, {
      module: "event-accreditation-invite-cron",
      origin: "job",
      metadata: { triggeredBy: "startup" },
    });
  });

  scheduledTask = cron.schedule(
    env.eventAccreditationInviteCron,
    async () => {
      try {
        const result = await runEventAccreditationInvites({ triggeredBy: "cron" });
        if (result.alreadyRunning) return;
        if (!result.ok) {
          logger.warn({ result }, "Disparo de convites agendado concluído com falhas");
        }
      } catch (err) {
        logger.error({ err }, "Erro no disparo de convites de credenciamento agendado");
        void captureError(err, {
          module: "event-accreditation-invite-cron",
          origin: "job",
          metadata: { triggeredBy: "cron" },
        });
      }
    },
    { timezone: env.eventAccreditationInviteTimezone },
  );

  logger.info(
    {
      cron: env.eventAccreditationInviteCron,
      timezone: env.eventAccreditationInviteTimezone,
    },
    "Cron de convites de credenciamento registrada",
  );

  return scheduledTask;
}

function stopEventAccreditationInviteCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = {
  startEventAccreditationInviteCron,
  stopEventAccreditationInviteCron,
  runEventAccreditationInvites,
};
