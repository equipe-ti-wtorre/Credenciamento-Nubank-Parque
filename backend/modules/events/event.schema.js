const Joi = require("joi");

function toDateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value;
}

const eventDayItemSchema = Joi.object({
  date: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().isoDate())
    .required(),
  id_type: Joi.number().integer().positive().required(),
});

const eventCreateSchema = Joi.object({
  name: Joi.string().max(200).required(),
  start: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().isoDate())
    .required(),
  end: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().isoDate())
    .required(),
  id_setor: Joi.number().integer().positive().required(),
  id_company_responsavel: Joi.number().integer().positive().required(),
  days: Joi.array().items(eventDayItemSchema).optional(),
})
  .custom((value, helpers) => {
    const start = toDateOnly(value.start);
    const end = toDateOnly(value.end);
    if (start > end) {
      return helpers.error("event.dateRange");
    }
    if (value.days && value.days.length > 0) {
      for (let i = 0; i < value.days.length; i++) {
        const dayDate = toDateOnly(value.days[i].date);
        if (dayDate < start || dayDate > end) {
          return helpers.error("event.dayOutOfRange", { index: i });
        }
      }
    }
    return value;
  })
  .messages({
    "event.dateRange": "A data de início deve ser anterior ou igual à data de término.",
    "event.dayOutOfRange":
      "A data do dia {{#index}} deve estar entre a data de início e a data de término do evento.",
  });

const eventDayCompanySchema = Joi.object({
  id_company: Joi.number().integer().positive().required(),
  id_producer: Joi.number().integer().positive().allow(null).optional(),
});

const eventPeriodSchema = Joi.object({
  start: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().isoDate())
    .required(),
  end: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().isoDate())
    .required(),
})
  .custom((value, helpers) => {
    const start = toDateOnly(value.start);
    const end = toDateOnly(value.end);
    if (start > end) {
      return helpers.error("event.dateRange");
    }
    return value;
  })
  .messages({
    "event.dateRange": "A data de início deve ser anterior ou igual à data de término.",
  });

const eventPreferencesSchema = Joi.object({
  notificar_portaria: Joi.boolean().required(),
});

module.exports = {
  eventCreateSchema,
  eventPeriodSchema,
  eventDayCompanySchema,
  eventDayItemSchema,
  eventPreferencesSchema,
  toDateOnly,
};
