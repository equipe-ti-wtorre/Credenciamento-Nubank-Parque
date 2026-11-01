"use strict";

const cron = require("node-cron");
const { child } = require("../config/logger");
const { captureError } = require("../modules/error-logs/error-logs.helpers");

const logger = child({ module: "facial-direct-cron" });

let directTask = null;
let expireTask = null;
let accessTask = null;
let directRunning = false;
let expireRunning = false;
let accessRunning = false;

async function runFacialDirect({ triggeredBy = "manual" } = {}) {
  if (directRunning) return { alreadyRunning: true, processed: 0 };
  directRunning = true;
  try {
    const direct = require("../modules/facial/facial.direct.service");
    return await direct.processDirectJobs();
  } catch (err) {
    logger.error({ err, triggeredBy }, "Erro ao enviar jobs faciais aos Dahua");
    await captureError(err, {
      module: "facial-direct-cron",
      origin: "job",
      metadata: { triggeredBy },
    });
    return { ok: false, processed: 0, error: err.message };
  } finally {
    directRunning = false;
  }
}

async function runFacialExpire({ triggeredBy = "manual" } = {}) {
  if (expireRunning) return { alreadyRunning: true, candidateCount: 0 };
  expireRunning = true;
  try {
    const facialExpire = require("../modules/facial/facial.expire.service");
    return await facialExpire.revokeFacialForExpiredAccesses();
  } catch (err) {
    logger.error({ err, triggeredBy }, "Erro ao revogar faces fora do prazo");
    await captureError(err, {
      module: "facial-direct-cron",
      origin: "job",
      metadata: { triggeredBy, step: "expire" },
    });
    return { ok: false, candidateCount: 0, error: err.message };
  } finally {
    expireRunning = false;
  }
}

async function runFacialAccessPoll({ triggeredBy = "manual" } = {}) {
  if (accessRunning) return { skipped: true, reason: "already_running", recorded: 0 };
  accessRunning = true;
  try {
    const poll = require("../modules/facial/facial.access-poll.service");
    return await poll.pollAccessOnce();
  } catch (err) {
    logger.error({ err, triggeredBy }, "Erro ao coletar passagens dos Dahua");
    await captureError(err, {
      module: "facial-direct-cron",
      origin: "job",
      metadata: { triggeredBy, step: "access-poll" },
    });
    return { skipped: false, recorded: 0, error: err.message };
  } finally {
    accessRunning = false;
  }
}
function startFacialDirectCron() {
  if (directTask) directTask.stop();
  if (expireTask) expireTask.stop();
  if (accessTask) accessTask.stop();

  runFacialDirect({ triggeredBy: "startup" }).catch((err) => {
    logger.error({ err }, "Falha no envio facial direto no startup");
  });

  directTask = cron.schedule("* * * * *", async () => {
    await runFacialDirect({ triggeredBy: "cron" });
  });
  expireTask = cron.schedule("*/15 * * * *", async () => {
    await runFacialExpire({ triggeredBy: "cron" });
  });
  accessTask = cron.schedule("*/20 * * * * *", async () => {
    await runFacialAccessPoll({ triggeredBy: "cron" });
  });

  return { directTask, expireTask, accessTask };
}

module.exports = {
  startFacialDirectCron,
  runFacialDirect,
  runFacialExpire,
  runFacialAccessPoll,
};
