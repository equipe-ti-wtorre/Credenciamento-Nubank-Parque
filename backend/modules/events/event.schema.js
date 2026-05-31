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
  name: Joi.string().min(3).max(150).required(),
  id_producer: Joi.number().integer().positive().required(),
  description: Joi.string().allow("", null).optional(),
  days: Joi.array().items(eventDayItemSchema).min(1).required(),
})
  .custom((value, helpers) => {
    const seen = new Set();
    for (let i = 0; i < value.days.length; i++) {
      const dayDate = toDateOnly(value.days[i].date);
      const key = `${dayDate}|${value.days[i].id_type}`;
      if (seen.has(key)) {
        return helpers.error("event.duplicateDay", { index: i });
      }
      seen.add(key);
    }
    return value;
  })
  .messages({
    "event.duplicateDay":
      "Não é permitido repetir a mesma combinação de data e tipo de dia (item {{#index}}).",
  });

const eventDayCompanySchema = Joi.object({
  id_company: Joi.number().integer().positive().required(),
  id_producer: Joi.number().integer().positive().allow(null).optional(),
});

module.exports = {
  eventCreateSchema,
  eventDayCompanySchema,
  eventDayItemSchema,
  toDateOnly,
};
