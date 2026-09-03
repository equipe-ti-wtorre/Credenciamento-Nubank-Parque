"use strict";

const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const facialGatewayConfig = require("./facial-gateway-config.service");
const { listDeviceResults, summarizeEnrollmentError } = require("./facial.contract");

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
  const config = await facialGatewayConfig.getPublicConfig();
  const configComplete =
    config.transport === "service_bus"
      ? config.has_events_secret &&
        config.has_commands_connection_string &&
        config.has_status_connection_string
      : !!config.has_events_secret;

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

  return {
    integration: {
      enabled: config.enabled,
      configComplete,
      transport: config.transport,
      commandsQueue: config.commands_queue,
      statusQueue: config.status_queue,
      atualizado_em: config.atualizado_em,
    },
    enrollment: {
      ...enrollmentCounts,
      lastActivityAt: lastActivityAt || null,
    },
    access: {
      total24h: Number(access24h?.total24h) || 0,
      blocked24h: Number(access24h?.blocked24h) || 0,
      lastEventAt: lastAccess?.lastEventAt || null,
      lastDeviceId: lastAccess?.deviceId || null,
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

function mapEnrollmentLogRow(row) {
  const payload = stripSensitivePayload(parseJson(row.payload_json)) || {};
  const syncTest = isSyncTestPayload(payload);
  const checks = mapSyncChecks(payload);
  const devices = syncTest ? [] : listDeviceResults(payload.devices);
  const overallStatus =
    payload.overallStatus ||
    payload.overall_status ||
    (syncTest
      ? payload.ok === false
        ? "failed"
        : Number(payload.warningCount) > 0
          ? "warning"
          : "ok"
      : null);
  const failedCheckLabels = checks
    .filter((check) => !check.ok)
    .map((check) => check.label)
    .filter(Boolean);
  const error = syncTest
    ? payload.error || failedCheckLabels.join("; ") || null
    : summarizeEnrollmentError(payload.error || payload.message || payload.reason, devices) ||
      (String(overallStatus || "").toLowerCase() === "failed"
        ? "Falha no enrollment sem detalhe do Gateway"
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
    overallStatus,
    error,
    devices,
    checks,
  };
}

function mapAccessLogRow(row) {
  const payload = parseJson(row.payload_json) || {};
  return {
    id: row.id,
    criado_em: row.criado_em,
    gateway_event_id: row.gateway_event_id,
    device_id: row.device_id,
    user_id: row.user_id,
    linked_id: row.linked_id,
    event_time: row.event_time,
    blocked: !!row.blocked,
    antipassback: !!row.antipassback,
    method: payload.method || null,
    status: payload.status || null,
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

    return {
      type: logType,
      logs: rows.map(mapEnrollmentLogRow),
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

  return {
    type: logType,
    logs: rows.map(mapAccessLogRow),
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
