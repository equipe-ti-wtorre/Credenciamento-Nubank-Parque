const Joi = require("joi");

const userUpdateSchema = Joi.object({
  perfil: Joi.string().valid("ADMIN", "USER", "PRODUTORA", "PADRAO", "CONTROLADOR").optional(),
  ativo: Joi.boolean().optional(),
  email: Joi.string().email().max(200).optional(),
  password: Joi.string().min(6).max(128).allow("").optional(),
  nome_completo: Joi.string().max(200).optional(),
  departamento: Joi.string().max(200).optional(),
  id_company: Joi.number().integer().positive().allow(null).optional(),
})
  .min(1)
  .messages({
    "object.min": "Informe ao menos um campo para atualizar.",
  });

module.exports = { userUpdateSchema };
