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
const facialGatewayConfig = require("./facial-gateway-config.service");
const serviceBusClient = require("./service-bus.client");
const enrollmentService = require("./facial.enrollment.service");
const jobsService = require("./facial.jobs.service");
const { resolveCollaboratorValidDates } = require("./facial.valid-dates");

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

  await enrollmentService.logEnrollmentPayload({
    idCollaborator: id,
    correlationId,
    direction: "outbound",
    payload:
      type === COMMAND_ENROLL
        ? { ...payload, photoBase64: photoBuffer ? `[${photoBuffer.length} bytes]` : null }
        : payload,
  });

  const runtime = await facialGatewayConfig.getRuntimeConfig();
  if (!runtime.enabled) {
    logger.debug({ correlationId, type }, "Integração facial desabilitada — comando ignorado");
    return { skipped: true, reason: "disabled", correlationId, linkedId, userId };
  }

  const transport = facialGatewayConfig.resolveTransport(runtime);
  if (transport === "service_bus") {
    const result = await serviceBusClient.sendCommand(payload, { correlationId });
    if (result.sent) {
      await enrollmentService.markEnrollmentPending(id, { correlationId, linkedId, userId });
    }
    return { ...result, correlationId, linkedId, userId, transport };
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
  return {
    queued: true,
    transport: "http_poll",
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

module.exports = {
  sendEnroll,
  sendRevoke,
  sendRevokeSafe,
  sendEnrollSafe,
  sendEnrollIfEligible,
};
