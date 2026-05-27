const Joi = require("joi");

const sessionSettingsSchema = Joi.object({
  session_idle_minutes: Joi.number().integer().min(5).max(480).required(),
});

module.exports = { sessionSettingsSchema };
