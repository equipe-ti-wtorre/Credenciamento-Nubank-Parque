const Joi = require("joi");

const companyUserCreateSchema = Joi.object({
  id_company: Joi.number().integer().positive().optional(),
  nome_completo: Joi.string().max(200).required(),
  email: Joi.string().email().max(200).required(),
  profile_codigo: Joi.string()
    .valid("EMPRESA_GESTOR", "EMPRESA_SOLICITANTE")
    .default("EMPRESA_SOLICITANTE"),
  send_invite: Joi.boolean().default(true),
  password: Joi.string().min(8).max(128).allow("", null).optional(),
});

const companyUserUpdateSchema = Joi.object({
  nome_completo: Joi.string().max(200).optional(),
  email: Joi.string().email().max(200).optional(),
  profile_codigo: Joi.string()
    .valid("EMPRESA_GESTOR", "EMPRESA_SOLICITANTE")
    .optional(),
  ativo: Joi.boolean().optional(),
  password: Joi.string().min(8).max(128).allow("").optional(),
})
  .min(1)
  .messages({
    "object.min": "Informe ao menos um campo para atualizar.",
  });

module.exports = {
  companyUserCreateSchema,
  companyUserUpdateSchema,
};
