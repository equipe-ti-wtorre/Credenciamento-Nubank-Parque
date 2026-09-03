"use strict";

const db = require("../../config/db");
const { child } = require("../../config/logger");
const {
  mapOverallToFacialStatus,
  parseCollaboratorId,
} = require("./facial.contract");

const logger = child({ module: "facial-enrollment" });

async function logEnrollmentPayload({
  idCollaborator,
  correlationId,
  direction,
  payload,
}) {
  try {
    await db.execute(
      `INSERT INTO facial_enrollment_log (id_collaborator, correlation_id, direction, payload_json)
       VALUES (?, ?, ?, ?)`,
      [
        idCollaborator || null,
        correlationId || null,
        direction,
        JSON.stringify(payload),
      ],
    );
  } catch (err) {
    logger.warn({ err, correlationId }, "Falha ao gravar facial_enrollment_log");
  }
}

async function markEnrollmentPending(idCollaborator, { correlationId, linkedId, userId }) {
  await db.execute(
    `UPDATE collaborator SET
       facial_linked_id = ?,
       facial_user_id = ?,
       facial_status = 'pending',
       facial_last_correlation_id = ?,
       facial_devices_json = NULL,
       facial_synced_at = NULL
     WHERE id_collaborator = ?`,
    [linkedId, userId, correlationId, idCollaborator],
  );
}

async function applyEnrollmentStatus(parsed) {
  const collaboratorId = parseCollaboratorId(parsed.linkedId, parsed.userId);
  if (!collaboratorId) {
    throw new Error(`Colaborador não resolvido: linkedId=${parsed.linkedId} userId=${parsed.userId}`);
  }

  const facialStatus = mapOverallToFacialStatus(parsed.overallStatus, parsed.command);
  const syncedAt =
    facialStatus === "synced" || facialStatus === "revoked" ? new Date() : null;

  await db.execute(
    `UPDATE collaborator SET
       facial_linked_id = COALESCE(?, facial_linked_id),
       facial_user_id = COALESCE(?, facial_user_id),
       facial_status = ?,
       facial_last_correlation_id = COALESCE(?, facial_last_correlation_id),
       facial_devices_json = ?,
       facial_synced_at = COALESCE(?, facial_synced_at)
     WHERE id_collaborator = ?`,
    [
      parsed.linkedId,
      parsed.userId,
      facialStatus,
      parsed.correlationId,
      JSON.stringify(parsed.devices || {}),
      syncedAt,
      collaboratorId,
    ],
  );

  await logEnrollmentPayload({
    idCollaborator: collaboratorId,
    correlationId: parsed.correlationId,
    direction: "inbound",
    payload: parsed,
  });

  logger.info(
    { collaboratorId, facialStatus, correlationId: parsed.correlationId },
    "Enrollment status processed",
  );

  try {
    const jobsService = require("./facial.jobs.service");
    await jobsService.completeJobFromStatus(parsed);
  } catch (err) {
    logger.warn({ err, correlationId: parsed.correlationId }, "Falha ao atualizar job facial");
  }

  return { collaboratorId, facialStatus };
}

module.exports = {
  logEnrollmentPayload,
  markEnrollmentPending,
  applyEnrollmentStatus,
};
