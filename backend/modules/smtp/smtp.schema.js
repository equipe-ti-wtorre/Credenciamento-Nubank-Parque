const Joi = require("joi");

const smtpSettingsSchema = Joi.object({
  provider: Joi.string().valid("smtp", "acs").optional(),
  // SMTP
  host: Joi.string().max(255).when("provider", {
    is: "acs",
    then: Joi.optional().allow("", null),
    otherwise: Joi.optional(),
  }),
  port: Joi.number().integer().min(1).max(65535).optional(),
  secure: Joi.boolean().optional(),
  user: Joi.string().max(255).optional().allow("", null),
  password: Joi.string().optional().allow(""),
  from_email: Joi.string().email().max(255).optional().allow("", null),
  from_name: Joi.string().max(100).optional().allow("", null),
  ativo: Joi.boolean().optional(),
  // Provider / ACS
  acs_connection_string: Joi.string().max(2000).optional().allow(""),
  acs_sender: Joi.string().email().max(255).optional().allow("", null),
  ocultar_para: Joi.boolean().optional(),
  email_ativo: Joi.boolean().optional(),
  ativo_email: Joi.boolean().optional(),
})
  .custom((value, helpers) => {
    const provider = value.provider || "smtp";
    if (provider === "smtp") {
      const missing = [];
      if (!value.host) missing.push("host");
      if (value.port === undefined || value.port === null) missing.push("port");
      if (!value.user) missing.push("user");
      if (!value.from_email) missing.push("from_email");
      if (missing.length) {
        return helpers.message(`Campos SMTP obrigatórios: ${missing.join(", ")}`);
      }
    }
    if (provider === "acs") {
      // connection string write-only — may be omitted if already saved
      if (value.acs_sender !== undefined && value.acs_sender === "") {
        return helpers.message("acs_sender é obrigatório para Azure ACS.");
      }
    }
    return value;
  });

const smtpTestSchema = Joi.object({
  destinatario: Joi.string().email().required(),
  assunto: Joi.string().max(500).optional(),
  corpo: Joi.string().max(5000).optional(),
});

module.exports = { smtpSettingsSchema, smtpTestSchema };
