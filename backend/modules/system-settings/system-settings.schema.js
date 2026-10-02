const Joi = require("joi");

const sessionSettingsSchema = Joi.object({
  session_idle_minutes: Joi.number().integer().min(5).max(480).required(),
});

const appearanceSettingsSchema = Joi.object({
  color_palette: Joi.string().valid("wtorre", "nubank-parque").required(),
});

const eventAccreditationNotifySchema = Joi.object({
  notify_all: Joi.boolean().required(),
  user_ids: Joi.array().items(Joi.number().integer().positive()).default([]),
});

const timeHm = Joi.string()
  .pattern(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
  .required()
  .messages({
    "string.pattern.base": "Informe o horário no formato HH:mm.",
  });

const accessScheduleSettingsSchema = Joi.object({
  comercial_start: timeHm,
  comercial_end: timeHm,
  noturno_start: timeHm,
  noturno_end: timeHm,
});

module.exports = {
  sessionSettingsSchema,
  appearanceSettingsSchema,
  eventAccreditationNotifySchema,
  accessScheduleSettingsSchema,
};
