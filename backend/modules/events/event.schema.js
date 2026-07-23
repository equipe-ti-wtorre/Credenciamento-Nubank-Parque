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
  days: Joi.array().items(eventDayItemSchema).optional(),
})
  .custom((value, helpers) => {
    const start = toDateOnly(value.start);
    const end = toDateOnly(value.end);
    if (start > end) {
      return helpers.error("event.dateRange");
    }
    if (value.days && value.days.length > 0) {
      const seen = new Set();
      for (let i = 0; i < value.days.length; i++) {
        const dayDate = toDateOnly(value.days[i].date);
        if (dayDate < start || dayDate > end) {
          return helpers.error("event.dayOutOfRange", { index: i });
        }
        if (seen.has(dayDate)) {
          return helpers.error("event.dayDuplicate", { index: i });
        }
        seen.add(dayDate);
      }
    }
    return value;
  })
  .messages({
    "event.dateRange": "A data de início deve ser anterior ou igual à data de término.",
    "event.dayOutOfRange":
      "A data do dia {{#index}} deve estar entre a data de início e a data de término do evento.",
    "event.dayDuplicate": "Há datas duplicadas na lista de dias do evento.",
  });

const eventPreferencesSchema = Joi.object({
  notificar_portaria: Joi.boolean().required(),
});

const eventStatusSchema = Joi.object({
  ativo: Joi.boolean().required(),
});

const eventResponsavelSchema = Joi.object({
  id_company_responsavel: Joi.number().integer().positive().required(),
});

const eventCompanyPhasesSchema = Joi.object({
  phases: Joi.array().items(Joi.string().trim().min(1)).min(1).required(),
});

const eventCredentialBulkCommitSchema = Joi.object({
  previewId: Joi.string().uuid().required(),
  decisions: Joi.array()
    .items(
      Joi.object({
        line: Joi.number().integer().positive().required(),
        action: Joi.string().valid("create", "link", "skip").required(),
      }),
    )
    .default([]),
});

const eventCompanyVehicleSchema = Joi.object({
  id_vehicle: Joi.number().integer().positive().required(),
});

const eventCompanyBulkConfirmSchema = Joi.object({
  previewToken: Joi.string().required(),
  decisoes: Joi.object({
    colaboradores: Joi.array().items(Joi.object().unknown(true)).default([]),
    veiculos: Joi.array().items(Joi.object().unknown(true)).default([]),
  }).default({}),
});

module.exports = {
  eventCreateSchema,
  eventPeriodSchema,
  eventDayCompanySchema,
  eventDayItemSchema,
  eventPreferencesSchema,
  eventStatusSchema,
  eventResponsavelSchema,
  eventCompanyPhasesSchema,
  eventCredentialBulkCommitSchema,
  eventCompanyVehicleSchema,
  eventCompanyBulkConfirmSchema,
  toDateOnly,
};
