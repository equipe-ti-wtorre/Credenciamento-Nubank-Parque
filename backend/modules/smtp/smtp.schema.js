const Joi = require("joi");

const smtpSettingsSchema = Joi.object({
  host: Joi.string().max(255).required(),
  port: Joi.number().integer().min(1).max(65535).required(),
  secure: Joi.boolean().optional(),
  user: Joi.string().max(255).required(),
  password: Joi.string().optional().allow(""),
  from_email: Joi.string().email().max(255).required(),
  from_name: Joi.string().max(100).optional().allow("", null),
  ativo: Joi.boolean().optional(),
});

const smtpTestSchema = Joi.object({
  destinatario: Joi.string().email().required(),
  assunto: Joi.string().max(500).optional(),
  corpo: Joi.string().max(5000).optional(),
});

module.exports = { smtpSettingsSchema, smtpTestSchema };
