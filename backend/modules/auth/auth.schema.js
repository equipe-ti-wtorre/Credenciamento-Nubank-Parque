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

const inviteCompleteSchema = Joi.object({
  password: Joi.string().min(8).max(128).required(),
  password_confirm: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "A confirmação de senha não confere.",
  }),
});

module.exports = { loginSchema, refreshSchema, logoutSchema, inviteCompleteSchema };
