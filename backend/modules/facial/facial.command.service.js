"use strict";

const { v4: uuidv4 } = require("uuid");
const { child } = require("../../config/logger");
const {
  COMMAND_ENROLL,
  COMMAND_REVOKE,
  buildLinkedId,
  buildUserId,
  buildEnrollCommand,
  buildRevokeCommand,
} = require("./facial.contract");
const enrollmentService = require("./facial.enrollment.service");
const jobsService = require("./facial.jobs.service");
const {
  resolveCollaboratorValidDates,
  hasPortariaReleaseToday,
} = require("./facial.valid-dates");

const logger = child({ module: "facial-command" });

async function dispatchCommand({
  type,
  collaborator,
  photoBuffer,
  photoFilename,
  options = {},
}) {
  const id = Number(collaborator.id_collaborator ?? collaborator);
  const name = collaborator.name;
  const correlationId = options.correlationId || uuidv4();
  const linkedId = buildLinkedId(id);
  const userId = buildUserId(id);

  const payload =
    type === COMMAND_REVOKE
      ? buildRevokeCommand({ correlationId, linkedId, userId })
      : buildEnrollCommand({
          correlationId,
          linkedId,
          userId,
          userName: name,
          photoBase64: photoBuffer ? photoBuffer.toString("base64") : undefined,
          cardNo: options.cardNo,
          validDateStart: options.validDateStart,
          validDateEnd: options.validDateEnd,
        });

  const devicesService = require("./facial.devices.service");
  const hasDevices = await devicesService.hasEnabled();
  const loggedPayload =
    type === COMMAND_ENROLL
      ? { ...payload, photoBase64: photoBuffer ? `[${photoBuffer.length} bytes]` : null }
      : { ...payload };
  if (!hasDevices) loggedPayload.skipped = "no_devices";

  await enrollmentService.logEnrollmentPayload({
    idCollaborator: id,
    correlationId,
    direction: "outbound",
    payload: loggedPayload,
  });

  if (!hasDevices) {
    logger.debug({ correlationId, type }, "Sem terminal Dahua ativo — comando ignorado");
    return { skipped: true, reason: "no_devices", correlationId, linkedId, userId };
  }

  await jobsService.enqueueJob({
    correlationId,
    idCollaborator: id,
    type,
    photoFilename: photoFilename || collaborator.picture || null,
    validDateStart: options.validDateStart,
    validDateEnd: options.validDateEnd,
  });
  await enrollmentService.markEnrollmentPending(id, { correlationId, linkedId, userId });
  require("./facial.direct.service").scheduleDirectJobs();
  return {
    queued: true,
    transport: "direct_dahua",
    correlationId,
    linkedId,
    userId,
  };
}

async function sendEnroll(collaborator, photoBuffer, options = {}) {
  if (!photoBuffer || !photoBuffer.length) {
    const fromDisk = jobsService.loadPhotoBuffer(collaborator.picture);
    if (!fromDisk) {
      throw new Error("Foto do colaborador ausente para enroll facial.");
    }
    photoBuffer = fromDisk;
  }
  const id = Number(collaborator.id_collaborator ?? collaborator);
  const dates = await resolveCollaboratorValidDates(id, options);
  if (!dates?.validDateStart || !dates?.validDateEnd) {
    logger.debug({ collaboratorId: id }, "Enroll facial ignorado — sem liberação da portaria hoje");
    return { skipped: true, reason: "not_released_today" };
  }
  return dispatchCommand({
    type: COMMAND_ENROLL,
    collaborator,
    photoBuffer,
    photoFilename: collaborator.picture,
    options: {
      ...options,
      validDateStart: dates.validDateStart,
      validDateEnd: dates.validDateEnd,
    },
  });
}

async function sendRevoke(collaboratorId, options = {}) {
  const id = Number(collaboratorId?.id_collaborator ?? collaboratorId);
  return dispatchCommand({
    type: COMMAND_REVOKE,
    collaborator: { id_collaborator: id, name: collaboratorId?.name },
    options,
  });
}

async function sendRevokeSafe(collaboratorId, reason) {
  try {
    return await sendRevoke(collaboratorId);
  } catch (err) {
    logger.warn({ err, collaboratorId, reason }, "Falha ao enviar revoke facial");
    return { error: err.message };
  }
}

async function sendEnrollSafe(collaborator, photoBuffer) {
  try {
    return await sendEnroll(collaborator, photoBuffer);
  } catch (err) {
    logger.error({ err, collaboratorId: collaborator.id_collaborator }, "Falha ao enviar enroll facial");
    throw err;
  }
}

async function sendEnrollIfEligible(collaborator, reason, options = {}) {
  const id = collaborator?.id_collaborator;
  if (!collaborator?.status) {
    logger.debug({ collaboratorId: id, reason }, "Enroll facial ignorado — inativo");
    return { skipped: true, reason: "inactive" };
  }
  const picture = collaborator.picture != null ? String(collaborator.picture).trim() : "";
  if (!picture) {
    logger.debug({ collaboratorId: id, reason }, "Enroll facial ignorado — sem foto");
    return { skipped: true, reason: "no_picture" };
  }
  if (collaborator.is_blocklisted) {
    logger.debug({ collaboratorId: id, reason }, "Enroll facial ignorado — blocklist");
    return { skipped: true, reason: "blocklist" };
  }
  try {
    return await sendEnroll(collaborator, null, options);
  } catch (err) {
    logger.warn({ err, collaboratorId: id, reason }, "Falha ao enviar enroll facial");
    return { error: err.message };
  }
}

async function revokeUnlessReleasedToday(idCollaborator, reason = "awaiting_portaria_release") {
  const id = Number(idCollaborator);
  if (!id) return { skipped: true, reason: "invalid" };
  if (await hasPortariaReleaseToday(id)) {
    return { skipped: true, reason: "released_today" };
  }
  return sendRevokeSafe(id, reason);
}

function scheduleRevokeUnlessReleasedToday(ids, reason = "approved_without_portaria") {
  const unique = [...new Set((Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean))];
  if (!unique.length) return;
  setImmediate(() => {
    void (async () => {
      for (const id of unique) {
        await revokeUnlessReleasedToday(id, reason);
      }
    })().catch((err) => {
      logger.warn({ err, ids: unique, reason }, "Falha ao revogar facial sem liberação da portaria");
    });
  });
}

module.exports = {
  sendEnroll,
  sendRevoke,
  sendRevokeSafe,
  sendEnrollSafe,
  sendEnrollIfEligible,
  revokeUnlessReleasedToday,
  scheduleRevokeUnlessReleasedToday,
};
