const Joi = require("joi");

const tenantBodySchema = Joi.object({
  nome: Joi.string().max(100).required(),
  azure_tenant_id: Joi.string().max(64).required(),
  client_id: Joi.string().max(64).required(),
  client_secret: Joi.string().optional().allow(""),
  ativo: Joi.boolean().optional(),
  eh_principal: Joi.boolean().optional(),
});

const tenantUpdateSchema = Joi.object({
  nome: Joi.string().max(100).optional(),
  azure_tenant_id: Joi.string().max(64).optional(),
  client_id: Joi.string().max(64).optional(),
  client_secret: Joi.string().optional().allow(""),
  ativo: Joi.boolean().optional(),
  eh_principal: Joi.boolean().optional(),
}).min(1);

module.exports = { tenantBodySchema, tenantUpdateSchema };
