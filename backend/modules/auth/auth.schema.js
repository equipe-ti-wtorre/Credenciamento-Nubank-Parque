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

const companyRegisterCompleteSchema = Joi.object({
  name: Joi.string().max(200).allow("", null).optional(),
  department: Joi.string().max(100).allow("", null).optional(),
  cnpj: Joi.string().required(),
  company_name: Joi.string().max(200).required(),
  fancy_name: Joi.string().trim().max(200).required().messages({
    "string.empty": "Nome fantasia é obrigatório.",
    "any.required": "Nome fantasia é obrigatório.",
  }),
  phone: Joi.string().trim().max(30).required().messages({
    "string.empty": "Telefone é obrigatório.",
    "any.required": "Telefone é obrigatório.",
  }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/[a-z]/)
    .pattern(/[A-Z]/)
    .pattern(/\d/)
    .pattern(/[^A-Za-z0-9]/)
    .required()
    .messages({
      "string.min": "A senha deve ter no mínimo 8 caracteres.",
      "string.pattern.base":
        "A senha deve ter maiúscula, minúscula, número e símbolo.",
    }),
  password_confirm: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "A confirmação de senha não confere.",
  }),
});

const companyPasswordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/[a-z]/)
  .pattern(/[A-Z]/)
  .pattern(/\d/)
  .pattern(/[^A-Za-z0-9]/)
  .required()
  .messages({
    "string.min": "A senha deve ter no mínimo 8 caracteres.",
    "string.pattern.base": "A senha deve ter maiúscula, minúscula, número e símbolo.",
  });

const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().email().required().messages({
    "string.email": "Informe um e-mail válido.",
    "any.required": "Informe um e-mail válido.",
  }),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().hex().length(64).required(),
  password: companyPasswordSchema,
  password_confirm: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "A confirmação de senha não confere.",
  }),
});

module.exports = {
  loginSchema,
  refreshSchema,
  logoutSchema,
  inviteCompleteSchema,
  companyRegisterCompleteSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
