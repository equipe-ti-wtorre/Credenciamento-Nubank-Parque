const Joi = require("joi");
const { ACTIONS, MODULE_KEYS } = require("../../config/modules.config");

const permissionSchema = Joi.object({
  modulo: Joi.string()
    .valid(...MODULE_KEYS)
    .required(),
  acao: Joi.string()
    .valid(...ACTIONS)
    .required(),
});

const profileCreateSchema = Joi.object({
  nome: Joi.string().max(100).required(),
  descricao: Joi.string().max(255).allow("", null).optional(),
  requires_company: Joi.boolean().optional(),
  permissions: Joi.array().items(permissionSchema).min(1).required(),
});

const profileUpdateSchema = Joi.object({
  nome: Joi.string().max(100).optional(),
  descricao: Joi.string().max(255).allow("", null).optional(),
  requires_company: Joi.boolean().optional(),
  ativo: Joi.boolean().optional(),
  permissions: Joi.array().items(permissionSchema).min(1).optional(),
})
  .min(1)
  .messages({
    "object.min": "Informe ao menos um campo para atualizar.",
  });

module.exports = { profileCreateSchema, profileUpdateSchema };
