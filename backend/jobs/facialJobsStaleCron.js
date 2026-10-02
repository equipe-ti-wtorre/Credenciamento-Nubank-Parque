"use strict";

const cron = require("node-cron");
const { child } = require("../config/logger");
const { captureError } = require("../modules/error-logs/error-logs.helpers");

const logger = child({ module: "facial-jobs-stale-cron" });

let scheduledTask = null;
let running = false;

async function runFacialJobsStaleRequeue({ triggeredBy = "manual" } = {}) {
  if (running) {
    return { alreadyRunning: true, ok: true, requeued: 0 };
  }
  running = true;
  try {
    const jobsService = require("../modules/facial/facial.jobs.service");
    const requeued = await jobsService.requeueStaleJobs();
    if (requeued > 0) {
      logger.info({ triggeredBy, requeued }, "Jobs facial stale recolocados na fila");
    }
    return { alreadyRunning: false, ok: true, requeued };
  } catch (err) {
    logger.error({ err, triggeredBy }, "Erro ao reprocessar jobs facial stale");
    await captureError(err, {
      module: "facial-jobs-stale-cron",
      origin: "job",
      metadata: { triggeredBy },
    });
    return { alreadyRunning: false, ok: false, requeued: 0, error: err.message };
  } finally {
    running = false;
  }
}

function startFacialJobsStaleCron() {
  if (scheduledTask) {
    scheduledTask.stop();
  }

  runFacialJobsStaleRequeue({ triggeredBy: "startup" }).catch((err) => {
    logger.error({ err }, "Falha no requeue de jobs facial no startup");
    void captureError(err, {
      module: "facial-jobs-stale-cron",
      origin: "job",
      metadata: { triggeredBy: "startup" },
    });
  });

  scheduledTask = cron.schedule("*/5 * * * *", async () => {
    await runFacialJobsStaleRequeue({ triggeredBy: "cron" });
  });

  return scheduledTask;
}

module.exports = {
  startFacialJobsStaleCron,
  runFacialJobsStaleRequeue,
};
