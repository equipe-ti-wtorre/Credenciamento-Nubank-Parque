"use strict";

const { child } = require("../../config/logger");
const {
  COMMAND_ENROLL,
  COMMAND_REVOKE,
  STATUS_ENROLLMENT,
  computeOverallStatus,
} = require("./facial.contract");
const jobsService = require("./facial.jobs.service");
const devicesService = require("./facial.devices.service");
const enrollmentService = require("./facial.enrollment.service");
const dahuaClient = require("./dahua.client");

const logger = child({ module: "facial-direct" });

let running = false;

async function pushToDevices(job, devices) {
  const results = {};
  for (const device of devices) {
    try {
      if (job.type === COMMAND_REVOKE) {
        await dahuaClient.revokeOnDevice(device, job.userId);
      } else {
        await dahuaClient.enrollOnDevice(device, {
          userId: job.userId,
          userName: job.userName,
          photoBase64: job.photoBase64,
          validFrom: job.validDateStart,
          validTo: job.validDateEnd,
        });
      }
      results[device.device_key] = { status: "synced" };
    } catch (err) {
      dahuaClient.logDeviceError(err, device, job.type);
      results[device.device_key] = {
        status: "failed",
        error: String(err.message || "falha").slice(0, 300),
      };
    }
  }
  return results;
}

async function executeJob(job, devices) {
  const devicesResult = await pushToDevices(job, devices);
  const overallStatus = computeOverallStatus(devicesResult);
  await enrollmentService.applyEnrollmentStatus({
    ok: true,
    type: STATUS_ENROLLMENT,
    correlationId: job.correlationId,
    linkedId: job.linkedId,
    userId: job.userId,
    command: job.type === COMMAND_REVOKE ? COMMAND_REVOKE : COMMAND_ENROLL,
    overallStatus,
    devices: devicesResult,
    timestamp: new Date().toISOString(),
  });
  return { correlationId: job.correlationId, overallStatus };
}

async function processDirectJobs() {
  if (running) {
    return { alreadyRunning: true, processed: 0 };
  }
  running = true;
  try {
    const devices = await devicesService.listEnabledRuntime();
    if (!devices.length) {
      return { skipped: true, reason: "no_devices", processed: 0 };
    }
    let processed = 0;
    for (let batch = 0; batch < 20; batch += 1) {
      const jobs = await jobsService.claimJobs(5);
      if (!jobs.length) break;
      for (const job of jobs) {
        await executeJob(job, devices);
        processed += 1;
      }
    }
    if (processed > 0) {
      logger.info({ processed, devices: devices.length }, "Jobs faciais enviados aos Dahua");
    }
    return { processed, devices: devices.length };
  } finally {
    running = false;
  }
}

function scheduleDirectJobs() {
  setImmediate(() => {
    processDirectJobs().catch((err) => {
      logger.warn({ err }, "Falha ao processar fila facial direta");
    });
  });
}

module.exports = {
  processDirectJobs,
  scheduleDirectJobs,
  executeJob,
};
