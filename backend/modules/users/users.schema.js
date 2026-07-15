const Joi = require("joi");

const userUpdateSchema = Joi.object({
  id_perfil: Joi.number().integer().positive().optional(),
  ativo: Joi.boolean().optional(),
  email: Joi.string().email().max(200).optional(),
  password: Joi.string().min(6).max(128).allow("").optional(),
  nome_completo: Joi.string().max(200).optional(),
  departamento: Joi.string().max(200).optional(),
  id_company: Joi.number().integer().positive().allow(null).optional(),
  session_idle_minutes: Joi.number()
    .integer()
    .min(0)
    .max(480)
    .allow(null)
    .optional()
    .custom((value, helpers) => {
      if (value === null || value === undefined || value === 0 || value >= 5) {
        return value;
      }
      return helpers.error("any.invalid");
    })
    .messages({
      "any.invalid":
        "Logout por inatividade deve ser 0 (desativado), omitido (padrão) ou entre 5 e 480 minutos.",
    }),
})
  .min(1)
  .messages({
    "object.min": "Informe ao menos um campo para atualizar.",
  });

module.exports = { userUpdateSchema };
