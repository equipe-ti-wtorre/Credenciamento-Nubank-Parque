const Joi = require("joi");

const eventValidateSchema = Joi.object({
  access_id: Joi.string().uuid({ version: "uuidv4" }).required().messages({
    "string.guid": "Código de acesso inválido.",
    "any.required": "Informe o código de acesso (QR).",
  }),
});

const eventSubstituteSchema = Joi.object({
  access_id: Joi.string().uuid({ version: "uuidv4" }).required().messages({
    "string.guid": "Código de acesso inválido.",
    "any.required": "Informe o código de acesso (QR).",
  }),
  id_substitute_collaborator: Joi.number().integer().positive().required().messages({
    "any.required": "Informe o colaborador substituto.",
  }),
});

module.exports = {
  eventValidateSchema,
  eventSubstituteSchema,
};
