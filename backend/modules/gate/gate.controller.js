const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const gateService = require("./gate.service");
const { notifyServiceGateCheckIn } = require("./gate.notifications");
const {
  eventValidateSchema,
  eventSubstituteSchema,
  serviceValidateSchema,
  serviceSubstituteSchema,
} = require("./gate.schema");

function respondDenial(res, req, denial) {
  if (denial.critical) {
    attachAudit(req, {
      action: "READ",
      module: "gate",
      event: "gate.event.denied",
      resource: {
        type: "credential",
        id: denial.credentialId,
        access_id: req.body?.access_id,
      },
      metadata: {
        alertLevel: "critical",
        error_code: denial.error_code,
        id_collaborator: denial.id_collaborator,
      },
    });
  }

  return res.status(denial.statusCode).json({
    access_allowed: false,
    reason: denial.reason,
    error_code: denial.error_code,
  });
}

exports.listTodayEvents = async (req, res, next) => {
  try {
    const credentials = await gateService.listTodayExpectedCredentials();
    res.json({ credentials });
  } catch (err) {
    next(err);
  }
};

exports.validateEvent = async (req, res, next) => {
  try {
    const { error, value } = eventValidateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await gateService.validateEventAccess(value.access_id);
    if (!result.allowed) {
      return respondDenial(res, req, result);
    }

    const actionEvent =
      result.data.action_registered === "CHECK_IN"
        ? "gate.event.check_in"
        : "gate.event.check_out";

    attachAudit(req, {
      action: "UPDATE",
      module: "gate",
      event: actionEvent,
      resource: {
        type: "credential",
        id: result.data.id_event_day_company_collaborator,
        access_id: value.access_id,
      },
      changes: { action_registered: result.data.action_registered },
    });

    res.json(result.data);
  } catch (err) {
    next(err);
  }
};

exports.substituteEvent = async (req, res, next) => {
  try {
    const { error, value } = eventSubstituteSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await gateService.substituteEventCollaborator(
      value.access_id,
      value.id_substitute_collaborator,
    );
    if (!result.allowed) {
      return respondDenial(res, req, result);
    }

    attachAudit(req, {
      action: "UPDATE",
      module: "gate",
      event: "gate.event.substitute",
      resource: {
        type: "credential",
        id: result.data.id_event_day_company_collaborator,
        access_id: value.access_id,
      },
      changes: {
        id_substitute_collaborator: value.id_substitute_collaborator,
      },
    });

    res.json(result.data);
  } catch (err) {
    next(err);
  }
};

exports.listTodayServices = async (req, res, next) => {
  try {
    const services = await gateService.listTodayExpectedServices();
    res.json({ services });
  } catch (err) {
    next(err);
  }
};

exports.validateService = async (req, res, next) => {
  try {
    const { error, value } = serviceValidateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await gateService.validateServiceAccess(value.access_id);
    if (!result.allowed) {
      return respondDenial(res, req, result);
    }

    const actionEvent =
      result.data.action_registered === "CHECK_IN"
        ? "gate.service.check_in"
        : "gate.service.check_out";

    attachAudit(req, {
      action: "UPDATE",
      module: "gate",
      event: actionEvent,
      resource: {
        type: "service_access",
        id:
          result.data.id_service_access_vehicle ||
          result.data.id_service_access_collaborator,
        access_id: value.access_id,
      },
      changes: { action_registered: result.data.action_registered },
    });

    if (result.data.action_registered === "CHECK_IN") {
      const subjectName =
        result.data.kind === "vehicle"
          ? result.data.vehicle?.plate
          : result.data.collaborator?.name;
      const idServiceAccess = result.data.id_service_access;
      if (idServiceAccess) {
        setImmediate(() => {
          void notifyServiceGateCheckIn({
            idServiceAccess,
            kind: result.data.kind,
            subjectName,
            finalidade: result.data.finalidade,
          }).catch(() => {});
        });
      }
    }

    res.json(result.data);
  } catch (err) {
    next(err);
  }
};

exports.substituteService = async (req, res, next) => {
  try {
    const { error, value } = serviceSubstituteSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await gateService.substituteServiceAccess(value.access_id, value);
    if (!result.allowed) {
      return respondDenial(res, req, result);
    }

    attachAudit(req, {
      action: "UPDATE",
      module: "gate",
      event: "gate.service.substitute",
      resource: {
        type: "service_access",
        id:
          result.data.id_service_access_vehicle ||
          result.data.id_service_access_collaborator,
        access_id: value.access_id,
      },
      changes: {
        id_substitute_vehicle: value.id_substitute_vehicle,
        id_substitute_collaborator: value.id_substitute_collaborator,
      },
    });

    res.json(result.data);
  } catch (err) {
    next(err);
  }
};
