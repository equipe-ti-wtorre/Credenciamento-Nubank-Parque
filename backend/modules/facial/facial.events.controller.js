"use strict";

const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const { accessEventSchema } = require("./facial.schema");
const eventsService = require("./facial.events.service");

async function handleFacialEvent(req, res, next) {
  try {
    const { error, value } = accessEventSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: false,
    });
    if (error) {
      throw new AppError(
        error.details.map((d) => d.message).join("; "),
        400,
      );
    }

    if (value.type !== "access") {
      return res.status(200).json({ received: true, handled: false, type: value.type });
    }

    const result = await eventsService.recordAccessEvent(value);

    attachAudit(req, {
      action: "CREATE",
      module: "facial",
      event: "facial.access",
      resource: {
        type: "facial_access",
        id: value.eventId,
        collaboratorId: result.collaboratorId || null,
      },
      metadata: {
        deviceId: value.deviceId,
        userId: String(value.userId),
        blocked: value.blocked,
        antipassback: value.antipassback,
        duplicate: result.duplicate,
        direcao: result.direcao || null,
        gate_applied: !!result.gate?.applied,
        action_registered: result.gate?.action_registered || null,
        gate_error_code: result.gate?.error_code || null,
      },
    });

    res.status(200).json({
      received: true,
      handled: true,
      duplicate: result.duplicate,
      id: result.id,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleFacialEvent,
};
