const Joi = require("joi");

const updateTemplateSchema = Joi.object({
  nome: Joi.string().trim().max(150).required(),
  descricao: Joi.string().trim().max(500).allow("", null).optional(),
  assunto: Joi.string().trim().max(500).required(),
  corpo_html: Joi.string().required(),
  corpo_texto: Joi.string().allow("", null).optional(),
  ativo: Joi.boolean().required(),
});

const previewSchema = Joi.object({
  assunto: Joi.string().trim().max(500).optional(),
  corpo_html: Joi.string().optional(),
  corpo_texto: Joi.string().allow("", null).optional(),
  vars: Joi.object().pattern(Joi.string(), Joi.alternatives().try(Joi.string(), Joi.number())).optional(),
});

const testSendSchema = Joi.object({
  destinatario: Joi.string().email().required(),
  assunto: Joi.string().trim().max(500).optional(),
  corpo_html: Joi.string().optional(),
  corpo_texto: Joi.string().allow("", null).optional(),
  vars: Joi.object().pattern(Joi.string(), Joi.alternatives().try(Joi.string(), Joi.number())).optional(),
});

module.exports = {
  updateTemplateSchema,
  previewSchema,
  testSendSchema,
};
