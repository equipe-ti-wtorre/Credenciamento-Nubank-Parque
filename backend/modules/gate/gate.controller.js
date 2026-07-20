const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const gateService = require("./gate.service");
const {
  scheduleServiceGateCheckIn,
  scheduleEventGateCheckIn,
} = require("./gate.notifications");
const {
  eventValidateSchema,
  eventSubstituteSchema,
  serviceValidateSchema,
  serviceSubstituteSchema,
  manualReleaseSchema,
  calendarQuerySchema,
  calendarDetailQuerySchema,
} = require("./gate.schema");
const { notifyApprovalCreated } = require("../approvals/approvals.notifications");
const { validateSearchQuery } = require("../collaborators/collaborator.schema");

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

    if (result.data.action_registered === "CHECK_IN" && result.data.id_event) {
      const idEvent = result.data.id_event;
      const collaboratorName = result.data.collaborator?.name;
      const eventName = result.data.event_name;
      const credentialId = result.data.id_event_day_company_collaborator;
      setImmediate(() => {
        void scheduleEventGateCheckIn({
          idEvent,
          credentialId,
          collaboratorName,
          eventName,
        }).catch(() => {});
      });
    }

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

exports.listCalendar = async (req, res, next) => {
  try {
    const { error, value } = calendarQuerySchema.validate(req.query, { abortEarly: true });
    if (error) throw new AppError(error.details[0].message, 400);

    const items = await gateService.listCalendarItems(value.from, value.to);
    res.json({ items, from: value.from, to: value.to });
  } catch (err) {
    next(err);
  }
};

exports.getCalendarDetail = async (req, res, next) => {
  try {
    const { error, value } = calendarDetailQuerySchema.validate(req.query, { abortEarly: true });
    if (error) throw new AppError(error.details[0].message, 400);

    const detail = await gateService.getCalendarItemDetail(
      value.kind,
      value.source_id,
      value.date,
    );
    res.json(detail);
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
          void scheduleServiceGateCheckIn({
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

exports.manualReleaseMeta = async (req, res, next) => {
  try {
    const meta = await gateService.listManualReleaseMeta();
    res.json(meta);
  } catch (err) {
    next(err);
  }
};

exports.manualReleaseSearchCollaborator = async (req, res, next) => {
  try {
    // Typeahead: um único termo (nome ou documento) retorna lista de resultados.
    if (req.query.q !== undefined) {
      const q = String(req.query.q || "").trim();
      if (q.length < 2) {
        res.json({ results: [] });
        return;
      }
      const result = await gateService.searchManualReleaseCollaborators(req, { q });
      res.json(result);
      return;
    }

    const validated = await validateSearchQuery(req.query);
    if (validated.error) throw new AppError(validated.error, 400);

    const result = await gateService.searchManualReleaseCollaborator(req, validated.value);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.createManualRelease = async (req, res, next) => {
  try {
    const { error, value } = manualReleaseSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 422);

    const result = await gateService.createManualRelease(req, value);

    attachAudit(req, {
      action: "CREATE",
      module: "gate",
      event: "gate.service.manual_release",
      resource: {
        type: "service_access",
        id: result.id_service_access,
      },
      metadata: {
        id_aprovacao: result.id_aprovacao,
        id_setor: result.id_setor,
        id_collaborators: (result.collaborators || []).map((c) => c.id_collaborator),
      },
    });

    if (result.id_aprovacao && result.id_setor) {
      setImmediate(() => {
        void notifyApprovalCreated({
          idAprovacao: result.id_aprovacao,
          idSetor: result.id_setor,
          idSolicitante: req.user.id,
        }).then((out) => {
          if (!out?.notified) {
            console.warn(
              "[gate.manual_release] setor sem notificação",
              result.id_aprovacao,
              result.id_setor,
              out?.reason,
            );
          }
        }).catch((err) => {
          console.warn("[gate.manual_release] falha ao notificar", err?.message || err);
        });
      });
    }

    res.status(201).json({ release: result });
  } catch (err) {
    next(err);
  }
};

exports.notifyPendingServiceApproval = async (req, res, next) => {
  try {
    const result = await gateService.notifyPendingServiceApproval(req, req.params.id);
    attachAudit(req, {
      action: "UPDATE",
      module: "gate",
      event: "gate.service.notify_approval",
      resource: {
        type: "service_access",
        id: result.id_service_access,
      },
      metadata: {
        id_aprovacao: result.id_aprovacao,
        id_setor: result.id_setor,
        notified: result.notified,
      },
    });
    res.json({
      message: `Setor ${result.setor_nome} notificado (${result.notified} destinatário${result.notified === 1 ? "" : "s"}).`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

exports.cancelPendingServiceApproval = async (req, res, next) => {
  try {
    const result = await gateService.cancelPendingServiceApproval(req, req.params.id);
    attachAudit(req, {
      action: "CANCEL",
      module: "gate",
      event: "gate.service.cancel_approval",
      resource: {
        type: "service_access",
        id: result.id_service_access,
      },
      metadata: {
        id_aprovacao: result.id_aprovacao,
        id_setor: result.id_setor,
      },
    });
    res.json({
      message: "Solicitação reprovada.",
      ...result,
    });
  } catch (err) {
    next(err);
  }
};
