const Joi = require("joi");

const sessionSettingsSchema = Joi.object({
  session_idle_minutes: Joi.number().integer().min(5).max(480).required(),
});

const appearanceSettingsSchema = Joi.object({
  color_palette: Joi.string().valid("wtorre", "nubank-parque").required(),
});

module.exports = { sessionSettingsSchema, appearanceSettingsSchema };
