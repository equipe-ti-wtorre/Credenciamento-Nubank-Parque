const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const eventService = require("./event.service");
const { eventCreateSchema, eventPeriodSchema, eventDayCompanySchema } = require("./event.schema");
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

exports.addCompanyToDay = async (req, res, next) => {
  try {
    const { error, value } = eventDayCompanySchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const link = await eventService.addCompanyToEventDay(
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
