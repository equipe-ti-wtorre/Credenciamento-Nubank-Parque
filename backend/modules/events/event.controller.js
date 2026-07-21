const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const eventService = require("./event.service");
const credentialsService = require("../credentials/credentials.service");
const {
  eventCreateSchema,
  eventPeriodSchema,
  eventDayCompanySchema,
  eventPreferencesSchema,
  eventStatusSchema,
  eventResponsavelSchema,
  eventCompanyPhasesSchema,
  eventCredentialBulkCommitSchema,
  eventCompanyVehicleSchema,
  eventCompanyBulkConfirmSchema,
} = require("./event.schema");
const { notifyApprovalCreated } = require("../approvals/approvals.notifications");

exports.listTypes = async (req, res, next) => {
  try {
    const types = await eventService.listEventDayTypes();
    res.json({ types });
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const { page, limit } = eventService.parseListQuery(req.query);
    const filters = eventService.parseListFilters(req.query);
    const result = await eventService.listEvents(req, { page, limit, filters });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const event = await eventService.getEventById(req, req.params.id);
    res.json({ event });
  } catch (err) {
    next(err);
  }
};

exports.updatePreferences = async (req, res, next) => {
  try {
    const { error, value } = eventPreferencesSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);

    const event = await eventService.updateEventPreferences(req, req.params.id, value);
    res.json({ event });
  } catch (err) {
    next(err);
  }
};

exports.patchStatus = async (req, res, next) => {
  try {
    const { error, value } = eventStatusSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);

    const { event, changes } = await eventService.updateEventActiveStatus(
      req,
      req.params.id,
      value.ativo,
    );

    let action = "UPDATE";
    if (changes.wasDeactivated) action = "DEACTIVATE";
    else if (changes.wasActivated) action = "ACTIVATE";

    attachAudit(req, {
      action,
      module: "events",
      event: `events.${action.toLowerCase()}`,
      resource: {
        type: "event",
        id: event.id_event,
        name: event.name,
      },
      changes: { ativo: event.ativo },
    });

    res.json({ event });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = eventCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const event = await eventService.createEvent(req, value);

    attachAudit(req, {
      action: "CREATE",
      module: "events",
      event: "events.create",
      resource: {
        type: "event",
        id: event.id_event,
        name: event.name,
      },
      changes: {
        name: event.name,
        start: event.start,
        end: event.end,
        id_setor: value.id_setor,
        id_company_responsavel: value.id_company_responsavel,
        daysCount: event.days?.length ?? 0,
      },
    });

    const { approvalCreated, ...eventPayload } = event;
    res.status(201).json({ event: eventPayload });

    if (approvalCreated) {
      setImmediate(() => {
        void notifyApprovalCreated({
          idAprovacao: approvalCreated.id,
          idSetor: value.id_setor,
          idSolicitante: req.user.id,
        }).catch(() => {});
      });
    }
  } catch (err) {
    next(err);
  }
};

exports.listProducers = async (req, res, next) => {
  try {
    const producers = await eventService.listProducerCompanies();
    res.json({ producers });
  } catch (err) {
    next(err);
  }
};

exports.listLinkableCompanies = async (req, res, next) => {
  try {
    const result = await eventService.listPadraoCompaniesForEvent(req, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.updatePeriod = async (req, res, next) => {
  try {
    const { error, value } = eventPeriodSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const event = await eventService.updateEventPeriod(req, req.params.id, value);

    attachAudit(req, {
      action: "UPDATE",
      module: "events",
      event: "events.period_change",
      resource: {
        type: "event",
        id: event.id_event,
        name: event.name,
      },
      metadata: {
        start: value.start,
        end: value.end,
        approvalReopened: event.approvalReopened,
        id_aprovacao: event.id_aprovacao || null,
      },
    });

    res.json({ event });

    // Notifica na reabertura e também quando o período muda com aprovação já pendente
    if (
      event.periodChanged &&
      event.id_aprovacao &&
      event.id_setor &&
      (event.approvalReopened || event.aprovacao_status === "PENDENTE")
    ) {
      setImmediate(() => {
        void notifyApprovalCreated({
          idAprovacao: event.id_aprovacao,
          idSetor: event.id_setor,
          idSolicitante: req.user.id,
        }).catch(() => {});
      });
    }
  } catch (err) {
    next(err);
  }
};

exports.updateResponsavel = async (req, res, next) => {
  try {
    const { error, value } = eventResponsavelSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);

    const event = await eventService.updateEventResponsavel(
      req,
      req.params.id,
      value.id_company_responsavel,
    );

    attachAudit(req, {
      action: "UPDATE",
      module: "events",
      event: "events.responsavel_change",
      resource: {
        type: "event",
        id: event.id_event,
        name: event.name,
      },
      changes: {
        id_company_responsavel: value.id_company_responsavel,
      },
    });

    res.json({ event });
  } catch (err) {
    next(err);
  }
};

exports.addCompanyToDay = async (req, res, next) => {
  try {
    const { error, value } = eventDayCompanySchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const link = await eventService.addCompanyToEventDay(
      req,
      req.params.id_event_day,
      value,
    );

    attachAudit(req, {
      action: "CREATE",
      module: "events",
      event: "events.days.companies.add",
      resource: {
        type: "event_day_company",
        id: link.id_event_day_company,
        id_event_day: link.id_event_day,
      },
      changes: {
        id_company: link.id_company,
        id_producer: link.id_producer,
      },
    });

    res.status(201).json({ link });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("Empresa já vinculada a este dia de evento.", 409));
    }
    next(err);
  }
};

exports.removeCompanyFromDay = async (req, res, next) => {
  try {
    const removed = await eventService.removeCompanyFromEventDay(
      req,
      req.params.id_event_day_company,
    );

    attachAudit(req, {
      action: "DELETE",
      module: "events",
      event: "events.days.companies.remove",
      resource: {
        type: "event_day_company",
        id: removed.id_event_day_company,
        id_event_day: removed.id_event_day,
      },
      changes: {
        id_company: removed.id_company,
        id_producer: removed.id_producer,
      },
    });

    res.json({ removed });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const removed = await eventService.deleteEvent(req, req.params.id);

    attachAudit(req, {
      action: "DELETE",
      module: "events",
      event: "events.delete",
      resource: {
        type: "event",
        id: removed.id_event,
        name: removed.name,
      },
    });

    res.json({ removed });
  } catch (err) {
    next(err);
  }
};

exports.syncCompanyPhases = async (req, res, next) => {
  try {
    const { error, value } = eventCompanyPhasesSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);

    const event = await eventService.syncCompanyPhases(
      req,
      req.params.id,
      req.params.idCompany,
      value.phases,
    );

    attachAudit(req, {
      action: "UPDATE",
      module: "events",
      event: "events.company_phases_sync",
      resource: {
        type: "event",
        id: event.id_event,
        name: event.name,
      },
      changes: {
        id_company: Number(req.params.idCompany),
        phases: value.phases,
      },
    });

    res.json({ event });
  } catch (err) {
    next(err);
  }
};

exports.bulkPreviewCompanyCredentials = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("Nenhum arquivo enviado.", 400);
    const result = await credentialsService.previewEventCompanyCredentialsBulk(
      req,
      req.params.id,
      req.params.idCompany,
      req.file,
    );

    attachAudit(req, {
      action: "CREATE",
      module: "credentials",
      event: "credentials.event_company_bulk_preview",
      resource: {
        type: "event_company_credential_bulk",
        id: result.previewId,
      },
      metadata: {
        id_event: Number(req.params.id),
        id_company: Number(req.params.idCompany),
        summary: result.summary,
      },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.bulkCommitCompanyCredentials = async (req, res, next) => {
  try {
    const { error, value } = eventCredentialBulkCommitSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await credentialsService.commitEventCompanyCredentialsBulk(
      req,
      req.params.id,
      req.params.idCompany,
      value,
    );

    attachAudit(req, {
      action: "CREATE",
      module: "credentials",
      event: "credentials.event_company_bulk_commit",
      resource: {
        type: "event_company_credential_bulk",
        id: value.previewId,
      },
      metadata: {
        id_event: Number(req.params.id),
        id_company: Number(req.params.idCompany),
        ...result,
      },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.listVehicleCounts = async (req, res, next) => {
  try {
    const counts = await eventService.listEventVehicleCounts(req, req.params.id);
    res.json({ counts });
  } catch (err) {
    next(err);
  }
};

exports.listCompanyVehicles = async (req, res, next) => {
  try {
    const result = await eventService.listCompanyVehicles(
      req,
      req.params.id,
      req.params.idCompany,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.addCompanyVehicle = async (req, res, next) => {
  try {
    const { error, value } = eventCompanyVehicleSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await eventService.addCompanyVehicle(
      req,
      req.params.id,
      req.params.idCompany,
      value.id_vehicle,
    );

    attachAudit(req, {
      action: "CREATE",
      module: "events",
      event: "events.company_vehicle_add",
      resource: {
        type: "event_company_vehicle",
        id: value.id_vehicle,
      },
      metadata: {
        id_event: Number(req.params.id),
        id_company: Number(req.params.idCompany),
        created: result.created,
      },
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

exports.removeCompanyVehicle = async (req, res, next) => {
  try {
    const result = await eventService.removeCompanyVehicle(
      req,
      req.params.id,
      req.params.idCompany,
      req.params.idVehicle,
    );

    attachAudit(req, {
      action: "DELETE",
      module: "events",
      event: "events.company_vehicle_remove",
      resource: {
        type: "event_company_vehicle",
        id: Number(req.params.idVehicle),
      },
      metadata: {
        id_event: Number(req.params.id),
        id_company: Number(req.params.idCompany),
      },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.downloadCompanyBulkTemplate = async (req, res, next) => {
  try {
    const { sendXlsx } = require("../../utils/bulkTemplateXlsx");
    await require("./event-company-vehicle.service").assertCanManageCompanyVehicles(
      req,
      req.params.id,
      req.params.idCompany,
    );
    const file = await eventService.getCompanyBulkImportTemplate();
    sendXlsx(res, file);
  } catch (err) {
    next(err);
  }
};

exports.previewCompanyBulkImport = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("Nenhum arquivo enviado.", 400);
    const result = await eventService.previewCompanyBulkImport(
      req,
      req.params.id,
      req.params.idCompany,
      req.file,
    );

    attachAudit(req, {
      action: "CREATE",
      module: "events",
      event: "events.company_bulk_import_preview",
      resource: {
        type: "event_company_bulk",
        id: result.previewToken,
      },
      metadata: {
        id_event: Number(req.params.id),
        id_company: Number(req.params.idCompany),
        resumo: result.resumo,
      },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.confirmCompanyBulkImport = async (req, res, next) => {
  try {
    const { error, value } = eventCompanyBulkConfirmSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await eventService.confirmCompanyBulkImport(
      req,
      req.params.id,
      req.params.idCompany,
      value,
    );

    attachAudit(req, {
      action: "CREATE",
      module: "events",
      event: "events.company_bulk_import_confirm",
      resource: {
        type: "event_company_bulk",
        id: value.previewToken,
      },
      metadata: {
        id_event: Number(req.params.id),
        id_company: Number(req.params.idCompany),
        colaboradores: result.colaboradores,
        veiculos: result.veiculos,
      },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};
