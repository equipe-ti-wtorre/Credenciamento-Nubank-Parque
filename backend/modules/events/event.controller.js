const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const eventService = require("./event.service");
const { eventCreateSchema, eventDayCompanySchema } = require("./event.schema");

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

    const event = await eventService.createEvent(value);

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
        id_producer: event.id_producer,
        start: event.start,
        end: event.end,
        daysCount: event.days?.length ?? 0,
      },
    });

    res.status(201).json({ event });
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
