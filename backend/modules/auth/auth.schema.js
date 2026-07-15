const Joi = require("joi");

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const logoutSchema = Joi.object({
  refreshToken: Joi.string().optional(),
});

const preferencesSchema = Joi.object({
  notificar_portaria: Joi.boolean().required(),
}).min(1);

module.exports = { loginSchema, refreshSchema, logoutSchema, preferencesSchema };
