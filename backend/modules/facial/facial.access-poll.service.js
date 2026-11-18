"use strict";

const { child } = require("../../config/logger");
const devicesService = require("./facial.devices.service");
const dahuaClient = require("./dahua.client");
const { recordAccessEvent } = require("./facial.events.service");
const {
  ACCESS_LIMIT_MAX,
  BASELINE_WINDOW_MS,
  parseAccessRecords,
  selectNewRecords,
  syntheticEventId,
} = require("./dahua.access");

const logger = child({ module: "facial-access-poll" });

const POLL_TIMEOUT_MS = 5000;

let running = false;

async function readDevice(device, now) {
  const baseline = device.last_rec_no == null;
  const since = baseline ? Math.floor((now.getTime() - BASELINE_WINDOW_MS) / 1000) : null;
  const data = await dahuaClient.findAccessRecords(device, {
    afterRecNo: baseline ? null : device.last_rec_no,
    since,
    limit: baseline ? ACCESS_LIMIT_MAX : ACCESS_LIMIT_MAX,
    timeoutMs: POLL_TIMEOUT_MS,
  });
  const records = parseAccessRecords(data);
  const decision = selectNewRecords(device.last_rec_no, records, now);
  let recorded = 0;
  for (const rec of decision.fresh) {
    await recordAccessEvent({
      eventId: syntheticEventId(device.id, rec.recNo),
      deviceId: device.device_key,
      userId: rec.userId,
      recNo: rec.recNo,
      eventTime: rec.eventTime,
      blocked: rec.blocked,
      method: rec.method,
      status: rec.status,
      antipassback: false,
    });
    recorded += 1;
  }
  if (decision.advance) {
    await devicesService.setAccessCursor(device.id, decision.cursor);
  }
  return { recorded, baseline: decision.baseline, advanced: decision.advance };
}

async function pollAccessOnce() {
  if (running) {
    return { skipped: true, reason: "already_running", recorded: 0 };
  }
  running = true;
  const now = new Date();
  try {
    const devices = await devicesService.listEnabledRuntime();
    let recorded = 0;
    let failed = 0;
    for (const device of devices) {
      try {
        const result = await readDevice(device, now);
        recorded += result.recorded;
      } catch (err) {
        failed += 1;
        dahuaClient.logDeviceError(err, device, "access-poll");
      }
    }
    if (recorded > 0 || failed > 0) {
      logger.info({ recorded, failed, devices: devices.length }, "Coleta de passagens Dahua");
    }
    return { skipped: false, recorded, failed, devices: devices.length };
  } finally {
    running = false;
  }
}

module.exports = {
  pollAccessOnce,
  POLL_TIMEOUT_MS,
};
