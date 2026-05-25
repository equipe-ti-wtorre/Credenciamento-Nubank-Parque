const Joi = require("joi");

const STATUS_AGUARDANDO_PRODUTORA = 1;
const STATUS_AGUARDANDO_ALLIANZ = 2;
const STATUS_APROVADO = 3;
const STATUS_NEGADO = 4;

const credentialCreateSchema = Joi.object({
  id_event_day_company: Joi.number().integer().positive().required(),
  id_collaborator: Joi.number().integer().positive().required(),
  id_collaborator_role: Joi.number().integer().positive().optional(),
});

const credentialStatusSchema = Joi.object({
  id_access_status: Joi.number()
    .integer()
    .valid(STATUS_AGUARDANDO_ALLIANZ, STATUS_APROVADO, STATUS_NEGADO)
    .required(),
  reason: Joi.when("id_access_status", {
    is: STATUS_NEGADO,
    then: Joi.string().trim().min(3).max(500).required(),
    otherwise: Joi.string().trim().max(500).allow("", null).optional(),
  }),
});

module.exports = {
  STATUS_AGUARDANDO_PRODUTORA,
  STATUS_AGUARDANDO_ALLIANZ,
  STATUS_APROVADO,
  STATUS_NEGADO,
  credentialCreateSchema,
  credentialStatusSchema,
};
