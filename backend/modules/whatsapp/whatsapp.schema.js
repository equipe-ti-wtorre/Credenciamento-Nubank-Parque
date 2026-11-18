const Joi = require("joi");

const whatsappSettingsSchema = Joi.object({
  provider: Joi.string().valid("openwa").optional(),
  base_url: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .max(255)
    .optional()
    .allow("", null)
    .messages({
      "string.uri": "URL do OpenWA inválida: use http(s)://host:porta.",
      "string.uriCustomScheme": "URL do OpenWA inválida: use http(s)://host:porta.",
    }),
  // write-only: vazio/omitido mantém a atual
  api_key: Joi.string().max(500).optional().allow("", null),
  session_id: Joi.string()
    .pattern(/^[a-zA-Z0-9-]{3,50}$/)
    .optional()
    .allow("", null)
    .messages({
      "string.pattern.base":
        "Nome da sessão inválido: use 3 a 50 caracteres, apenas letras, números e hífen.",
    }),
  default_country_code: Joi.string().pattern(/^\d{1,4}$/).optional().allow("", null),
  ativo: Joi.boolean().optional(),
});

const whatsappTestSchema = Joi.object({
  destinatario: Joi.string().trim().min(8).max(64).required().messages({
    "any.required": "Informe o telefone de destino.",
    "string.min": "Telefone de destino muito curto.",
  }),
  mensagem: Joi.string().trim().max(4096).optional().allow(""),
});

const dailyList = Joi.array().items(Joi.number().integer().min(1).max(100000)).min(1).max(30);

const whatsappLimitsSchema = Joi.object({
  pacing_enabled: Joi.boolean().required(),
  warmup_schedule: dailyList.required().messages({
    "array.min": "Informe ao menos um valor no limite diário.",
  }),
  cold_cap_enabled: Joi.boolean().required(),
  cold_daily_cap: Joi.when("cold_cap_enabled", {
    is: true,
    then: dailyList.required(),
    otherwise: Joi.array().optional(),
  }),
  breaker_threshold: Joi.number().integer().min(1).max(100).required(),
  breaker_cooldown_minutes: Joi.number().integer().min(1).max(1440).required(),
  simulate_typing: Joi.boolean().required(),
  simulate_typing_max_ms: Joi.number().integer().min(0).max(30000).required(),
  restart: Joi.boolean().optional(),
});

module.exports = { whatsappSettingsSchema, whatsappTestSchema, whatsappLimitsSchema };
