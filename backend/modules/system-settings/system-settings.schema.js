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

module.exports = {
  sessionSettingsSchema,
  appearanceSettingsSchema,
  eventAccreditationNotifySchema,
};
