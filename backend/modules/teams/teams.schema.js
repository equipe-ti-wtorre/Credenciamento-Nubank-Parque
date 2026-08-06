const Joi = require("joi");

const httpsUrl = Joi.string()
  .max(500)
  .trim()
  .custom((value, helpers) => {
    if (!value) return value;
    const v = value.startsWith("http://") ? value.replace(/^http:\/\//i, "https://") : value;
    if (!/^https:\/\/.+/i.test(v)) {
      return helpers.error("string.uriCustomScheme", { scheme: "https" });
    }
    return v;
  })
  .messages({
    "string.uriCustomScheme": "A URL deve começar com https://",
  });

const teamsBodySchema = Joi.object({
  nome: Joi.string().max(100).required(),
  tipo: Joi.string().valid("user", "channel").default("user"),
  azure_tenant_ref_id: Joi.number().integer().positive().required(),
  team_id: Joi.when("tipo", {
    is: "channel",
    then: Joi.string().max(64).required(),
    otherwise: Joi.string().max(64).optional().allow("", null),
  }),
  channel_id: Joi.when("tipo", {
    is: "channel",
    then: Joi.string().max(128).required(),
    otherwise: Joi.string().max(128).optional().allow("", null),
  }),
  destinatario_email: Joi.when("tipo", {
    is: "user",
    then: Joi.string().email().max(255).required(),
    otherwise: Joi.string().email().max(255).optional().allow("", null),
  }),
  activity_web_url: Joi.when("tipo", {
    is: "user",
    then: httpsUrl.required(),
    otherwise: httpsUrl.optional().allow("", null),
  }),
  teams_app_id: Joi.when("tipo", {
    is: "user",
    then: Joi.string().uuid().required().messages({
      "any.required": "Teams App ID é obrigatório para notificações ao usuário.",
      "string.uuid": "Teams App ID deve ser um GUID válido.",
    }),
    otherwise: Joi.string().max(64).optional().allow("", null),
  }),
  ativo: Joi.boolean().optional(),
});

const teamsUpdateSchema = Joi.object({
  nome: Joi.string().max(100).optional(),
  tipo: Joi.string().valid("user", "channel").optional(),
  azure_tenant_ref_id: Joi.number().integer().positive().optional(),
  team_id: Joi.string().max(64).optional().allow("", null),
  channel_id: Joi.string().max(128).optional().allow("", null),
  destinatario_email: Joi.string().email().max(255).optional().allow("", null),
  activity_web_url: httpsUrl.optional().allow("", null),
  teams_app_id: Joi.string().uuid().optional().allow("", null),
  ativo: Joi.boolean().optional(),
}).min(1);

const teamsTestSchema = Joi.object({
  email: Joi.string().email().optional(),
  mensagem: Joi.string().max(5000).optional(),
});

const teamsSendSchema = Joi.object({
  email: Joi.string().email().required(),
  mensagem: Joi.string().max(5000).required(),
});

module.exports = { teamsBodySchema, teamsUpdateSchema, teamsTestSchema, teamsSendSchema };
