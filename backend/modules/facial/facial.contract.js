"use strict";

/**
 * Contrato Gateway ↔ Credenciamento (espelho de access-control-gateway/credenciamento-contract.js).
 *
 * Regra userId vs linkedId:
 * - linkedId = ID canônico do colaborador (collaborators.id como string, prefixo "col-")
 * - userId = mesmo valor numérico sem prefixo (terminais Dahua aceitam string numérica)
 */

const COMMAND_ENROLL = "enroll";
const COMMAND_REVOKE = "revoke";
const STATUS_ENROLLMENT = "enrollment-status";

const OVERALL_SYNCED = "synced";
const OVERALL_PARTIAL = "partial";
const OVERALL_PENDING = "pending";
const OVERALL_FAILED = "failed";

const DEVICE_IDS = ["entrada-01", "entrada-02", "saida-01", "saida-02"];

function resolveLinkedId(payload) {
  const linked = payload?.linkedId ?? payload?.linked_id;
  if (linked != null && String(linked).trim() !== "") return String(linked).trim();
  if (payload?.userId != null) return String(payload.userId);
  return null;
}

function resolveCorrelationId(payload) {
  const id = payload?.correlationId ?? payload?.correlation_id;
  return id != null && String(id).trim() !== "" ? String(id).trim() : null;
}

/** linkedId canônico a partir do collaborator.id */
function buildLinkedId(collaboratorId) {
  return `col-${collaboratorId}`;
}

/** userId nos terminais Dahua — numérico derivado do colaborador */
function buildUserId(collaboratorId) {
  return String(collaboratorId);
}

/** Extrai id_collaborator de linkedId (col-123) ou userId numérico. */
function parseCollaboratorId(linkedId, userId) {
  const linked = linkedId != null ? String(linkedId).trim() : "";
  const colMatch = /^col-(\d+)$/.exec(linked);
  if (colMatch) return Number(colMatch[1]);
  if (/^\d+$/.test(linked)) return Number(linked);
  const uid = userId != null ? String(userId).trim() : "";
  if (/^\d+$/.test(uid)) return Number(uid);
  return null;
}

function computeOverallStatus(results) {
  const statuses = Object.values(results || {})
    .map((r) => r?.status)
    .filter(Boolean);
  if (!statuses.length) return OVERALL_FAILED;
  if (statuses.every((s) => s === OVERALL_SYNCED)) return OVERALL_SYNCED;
  if (statuses.every((s) => s === OVERALL_FAILED)) return OVERALL_FAILED;
  if (statuses.every((s) => s === OVERALL_PENDING)) return OVERALL_PENDING;
  const hasSynced = statuses.some((s) => s === OVERALL_SYNCED);
  const hasFailed = statuses.some((s) => s === OVERALL_FAILED);
  const hasPending = statuses.some((s) => s === OVERALL_PENDING);
  if (hasSynced && (hasFailed || hasPending)) return OVERALL_PARTIAL;
  if (hasPending && !hasFailed) return OVERALL_PENDING;
  return OVERALL_PARTIAL;
}

function mapOverallToFacialStatus(overallStatus, command) {
  if (command === COMMAND_REVOKE && overallStatus === OVERALL_SYNCED) return "revoked";
  switch (overallStatus) {
    case OVERALL_SYNCED:
      return "synced";
    case OVERALL_PARTIAL:
      return "partial";
    case OVERALL_PENDING:
      return "pending";
    case OVERALL_FAILED:
      return "failed";
    default:
      return "failed";
  }
}

/** Extrai YYYY-MM-DD de DATE, datetime ou formato compacto Dahua. */
function toSqlDate(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const compact14 = /^(\d{4})(\d{2})(\d{2})\d{6}$/.exec(text);
  if (compact14) return `${compact14[1]}-${compact14[2]}-${compact14[3]}`;
  const compact8 = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (compact8) return `${compact8[1]}-${compact8[2]}-${compact8[3]}`;
  return null;
}

/** Início do dia no formato que o Gateway/Dahua espera. */
function toValidDateStart(value) {
  const date = toSqlDate(value);
  return date ? `${date} 00:00:00` : undefined;
}

/** Fim do dia no formato que o Gateway/Dahua espera (evita janela de duração zero). */
function toValidDateEnd(value) {
  const date = toSqlDate(value);
  return date ? `${date} 23:59:59` : undefined;
}

function buildEnrollCommand({
  correlationId,
  linkedId,
  userId,
  userName,
  photoBase64,
  cardNo,
  validDateStart,
  validDateEnd,
}) {
  return {
    type: COMMAND_ENROLL,
    correlationId,
    linkedId,
    userId: String(userId),
    userName,
    photoBase64,
    cardNo: cardNo || String(userId),
    validDateStart: toValidDateStart(validDateStart),
    validDateEnd: toValidDateEnd(validDateEnd),
  };
}

function buildRevokeCommand({ correlationId, linkedId, userId }) {
  return {
    type: COMMAND_REVOKE,
    correlationId,
    linkedId,
    userId: String(userId),
  };
}

function cleanErrorText(value) {
  if (value == null) return null;
  const text = String(value).replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  return text || null;
}

function listDeviceResults(devices) {
  if (!devices || typeof devices !== "object" || Array.isArray(devices)) return [];
  return Object.entries(devices).map(([deviceId, info]) => {
    const item = info && typeof info === "object" ? info : {};
    return {
      deviceId: String(deviceId),
      status: item.status != null ? String(item.status) : null,
      error: cleanErrorText(item.error || item.message || item.reason || null),
    };
  });
}

function summarizeEnrollmentError(topLevelError, devices) {
  const top = cleanErrorText(topLevelError);
  if (top) return top;
  const results = Array.isArray(devices) ? devices : listDeviceResults(devices);
  const msgs = results.filter((d) => d.error).map((d) => `${d.deviceId}: ${d.error}`);
  if (!msgs.length) return null;
  return msgs.join(" · ");
}

function parseEnrollmentStatus(body) {
  if (!body || body.type !== STATUS_ENROLLMENT) {
    return { ok: false, error: "type deve ser enrollment-status" };
  }
  const devices = body.devices || {};
  return {
    ok: true,
    correlationId: resolveCorrelationId(body),
    linkedId: resolveLinkedId(body),
    userId: body.userId != null ? String(body.userId) : null,
    command: body.command === COMMAND_REVOKE ? COMMAND_REVOKE : COMMAND_ENROLL,
    overallStatus: body.overallStatus || body.overall_status || OVERALL_FAILED,
    devices,
    error: summarizeEnrollmentError(body.error, devices),
    timestamp: body.timestamp || new Date().toISOString(),
  };
}

module.exports = {
  COMMAND_ENROLL,
  COMMAND_REVOKE,
  STATUS_ENROLLMENT,
  OVERALL_SYNCED,
  OVERALL_PARTIAL,
  OVERALL_PENDING,
  OVERALL_FAILED,
  DEVICE_IDS,
  resolveLinkedId,
  resolveCorrelationId,
  buildLinkedId,
  buildUserId,
  parseCollaboratorId,
  computeOverallStatus,
  mapOverallToFacialStatus,
  toSqlDate,
  toValidDateStart,
  toValidDateEnd,
  buildEnrollCommand,
  buildRevokeCommand,
  cleanErrorText,
  listDeviceResults,
  summarizeEnrollmentError,
  parseEnrollmentStatus,
};
