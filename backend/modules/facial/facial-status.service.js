"use strict";

const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const devicesService = require("./facial.devices.service");
const {
  COMMAND_ENROLL,
  COMMAND_REVOKE,
  listDeviceResults,
  parseCollaboratorId,
  summarizeEnrollmentError,
} = require("./facial.contract");
const { resolveAccessDirection } = require("./facial.direction");
const { accessMethodLabel, accessStatusLabel } = require("./dahua.access");

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stripSensitivePayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const copy = { ...payload };
  if ("photoBase64" in copy) {
    copy.photoBase64 = copy.photoBase64 ? "[redacted]" : copy.photoBase64;
  }
  return copy;
}

async function getStatusSummary() {
  const directDevices = await devicesService.countEnabled();
  const configComplete = directDevices > 0;

  const enrollmentCounts = {
    synced: 0,
    pending: 0,
    partial: 0,
    failed: 0,
    revoked: 0,
  };

  const [statusRows] = await db.execute(
    `SELECT facial_status AS status, COUNT(*) AS total
     FROM collaborator
     WHERE facial_status IS NOT NULL
     GROUP BY facial_status`,
  );
  for (const row of statusRows) {
    const key = row.status;
    if (key && enrollmentCounts[key] !== undefined) {
      enrollmentCounts[key] = Number(row.total) || 0;
    }
  }

  const [[lastEnrollmentRow]] = await db.execute(
    `SELECT MAX(GREATEST(
       COALESCE(facial_synced_at, '1970-01-01'),
       COALESCE(atualizado_em, '1970-01-01')
     )) AS lastActivityAt
     FROM collaborator
     WHERE facial_status IS NOT NULL`,
  );

  const [[lastLogRow]] = await db.execute(
    `SELECT MAX(criado_em) AS lastLogAt FROM facial_enrollment_log`,
  );

  const lastEnrollmentFromLog = lastLogRow?.lastLogAt || null;
  const lastFromCollaborator = lastEnrollmentRow?.lastActivityAt || null;
  let lastActivityAt = lastEnrollmentFromLog;
  if (lastFromCollaborator && (!lastActivityAt || lastFromCollaborator > lastActivityAt)) {
    lastActivityAt = lastFromCollaborator;
  }

  const [[access24h]] = await db.execute(
    `SELECT
       COUNT(*) AS total24h,
       SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END) AS blocked24h
     FROM facial_access_log
     WHERE criado_em >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
  );

  const [[lastAccess]] = await db.execute(
    `SELECT criado_em AS lastEventAt, device_id AS deviceId
     FROM facial_access_log
     ORDER BY criado_em DESC
     LIMIT 1`,
  );

  const lastDeviceId = lastAccess?.deviceId || null;
  const deviceNames = lastDeviceId ? await loadDeviceNames() : new Map();

  return {
    integration: {
      enabled: directDevices > 0,
      configComplete,
      transport: "direct_dahua",
    },
    enrollment: {
      ...enrollmentCounts,
      lastActivityAt: lastActivityAt || null,
    },
    access: {
      total24h: Number(access24h?.total24h) || 0,
      blocked24h: Number(access24h?.blocked24h) || 0,
      lastEventAt: lastAccess?.lastEventAt || null,
      lastDeviceId,
      lastDeviceName: lastDeviceId ? deviceNames.get(String(lastDeviceId)) || null : null,
    },
  };
}

function isSyncTestPayload(payload) {
  const type = String(payload?.type || payload?.command || "").toLowerCase();
  return type === "sync_test" || type === "sync-test";
}

function mapSyncChecks(payload) {
  if (!Array.isArray(payload?.checks)) return [];
  return payload.checks.map((check) => ({
    key: check?.key || "",
    ok: !!check?.ok,
    warning: !!check?.warning,
    label: String(check?.label || ""),
  }));
}

async function loadDeviceNames() {
  const [rows] = await db.execute("SELECT device_key, name FROM facial_devices");
  const map = new Map();
  for (const row of rows) map.set(String(row.device_key), row.name || null);
  return map;
}

async function loadCollaboratorNames(ids) {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  const map = new Map();
  if (!unique.length) return map;
  const placeholders = unique.map(() => "?").join(", ");
  const [rows] = await db.execute(
    `SELECT id_collaborator, name FROM collaborator WHERE id_collaborator IN (${placeholders})`,
    unique,
  );
  for (const row of rows) map.set(Number(row.id_collaborator), row.name || null);
  return map;
}

function resolveEnrollmentAction(payload) {
  const raw = String(payload.command || payload.type || "").toLowerCase();
  if (raw === COMMAND_REVOKE) return COMMAND_REVOKE;
  if (raw === COMMAND_ENROLL) return COMMAND_ENROLL;
  return null;
}

function resolveEnrollmentStage(row, payload, syncTest) {
  if (syncTest) return "test";
  if (payload.skipped) return "skipped";
  return row.direction === "inbound" ? "result" : "queued";
}

function mapEnrollmentLogRow(row, deviceNames) {
  const payload = stripSensitivePayload(parseJson(row.payload_json)) || {};
  const syncTest = isSyncTestPayload(payload);
  const stage = resolveEnrollmentStage(row, payload, syncTest);
  const checks = mapSyncChecks(payload);
  const devices = syncTest
    ? []
    : listDeviceResults(payload.devices).map((device) => ({
        ...device,
        deviceName: deviceNames.get(device.deviceId) || null,
      }));
  const overallStatus =
    payload.overallStatus ||
    payload.overall_status ||
    (syncTest
      ? payload.ok === false
        ? "failed"
        : Number(payload.warningCount) > 0
          ? "warning"
          : "ok"
      : stage === "skipped"
        ? "skipped"
        : null);
  const failedCheckLabels = checks
    .filter((check) => !check.ok)
    .map((check) => check.label)
    .filter(Boolean);
  const error = syncTest
    ? payload.error || failedCheckLabels.join("; ") || null
    : summarizeEnrollmentError(payload.error || payload.message, devices) ||
      (String(overallStatus || "").toLowerCase() === "failed"
        ? "Falha sem detalhe do terminal"
        : null);
  return {
    id: row.id,
    criado_em: row.criado_em,
    direction: row.direction,
    correlation_id: row.correlation_id,
    id_collaborator: row.id_collaborator,
    collaborator_name: row.collaborator_name || null,
    type: payload.type || payload.command || null,
    command: payload.command || null,
    action: resolveEnrollmentAction(payload),
    stage,
    overallStatus,
    error,
    devices,
    checks,
  };
}

function mapGate(payload) {
  const gate = payload.gate;
  if (!gate || typeof gate !== "object") return null;
  return {
    applied: !!gate.applied,
    skipped: !!gate.skipped,
    action_registered: gate.action_registered || null,
    error_code: gate.error_code || null,
    reason: gate.reason || null,
  };
}

function mapAccessLogRow(row, deviceNames, collaboratorNames) {
  const payload = parseJson(row.payload_json) || {};
  const collaboratorId = parseCollaboratorId(row.linked_id, row.user_id);
  const blocked = !!row.blocked;
  return {
    id: row.id,
    criado_em: row.criado_em,
    gateway_event_id: row.gateway_event_id,
    device_id: row.device_id,
    device_name: deviceNames.get(String(row.device_id)) || null,
    user_id: row.user_id,
    linked_id: row.linked_id,
    id_collaborator: collaboratorId,
    collaborator_name: collaboratorId ? collaboratorNames.get(collaboratorId) || null : null,
    event_time: row.event_time,
    direction: resolveAccessDirection({ direcao: payload.direcao, deviceId: row.device_id }),
    blocked,
    antipassback: !!row.antipassback,
    method: payload.method || null,
    status: payload.status || null,
    method_label: accessMethodLabel(payload.method),
    status_label: accessStatusLabel(payload.status, blocked),
    gate: mapGate(payload),
  };
}

async function listLogs({ type, page = 1, limit = 15 }) {
  const logType = String(type || "").toLowerCase();
  if (logType !== "enrollment" && logType !== "access") {
    throw new AppError("type deve ser enrollment ou access.", 400);
  }

  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 15));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  if (logType === "enrollment") {
    const [[countRow]] = await db.execute(
      "SELECT COUNT(*) AS total FROM facial_enrollment_log",
    );
    const total = Number(countRow?.total) || 0;

    const [rows] = await db.execute(
      `SELECT fel.id, fel.id_collaborator, fel.correlation_id, fel.direction,
              fel.payload_json, fel.criado_em, c.name AS collaborator_name
       FROM facial_enrollment_log fel
       LEFT JOIN collaborator c ON c.id_collaborator = fel.id_collaborator
       ORDER BY fel.criado_em DESC
       LIMIT ? OFFSET ?`,
      [safeLimit, offset],
    );

    const deviceNames = await loadDeviceNames();
    return {
      type: logType,
      logs: rows.map((row) => mapEnrollmentLogRow(row, deviceNames)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  const [[countRow]] = await db.execute("SELECT COUNT(*) AS total FROM facial_access_log");
  const total = Number(countRow?.total) || 0;

  const [rows] = await db.execute(
    `SELECT id, gateway_event_id, device_id, user_id, linked_id,
            event_time, antipassback, blocked, payload_json, criado_em
     FROM facial_access_log
     ORDER BY criado_em DESC
     LIMIT ? OFFSET ?`,
    [safeLimit, offset],
  );

  const deviceNames = await loadDeviceNames();
  const collaboratorNames = await loadCollaboratorNames(
    rows.map((row) => parseCollaboratorId(row.linked_id, row.user_id)),
  );
  return {
    type: logType,
    logs: rows.map((row) => mapAccessLogRow(row, deviceNames, collaboratorNames)),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

module.exports = {
  getStatusSummary,
  listLogs,
};
