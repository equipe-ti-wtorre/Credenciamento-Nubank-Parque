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

const serviceValidateSchema = Joi.object({
  access_id: Joi.string().uuid({ version: "uuidv4" }).required().messages({
    "string.guid": "Código de acesso inválido.",
    "any.required": "Informe o código de acesso (QR).",
  }),
});

const serviceSubstituteSchema = Joi.object({
  access_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  id_substitute_vehicle: Joi.number().integer().positive().optional(),
  id_substitute_collaborator: Joi.number().integer().positive().optional(),
})
  .or("id_substitute_vehicle", "id_substitute_collaborator")
  .messages({
    "object.missing": "Informe o veículo ou colaborador substituto.",
  });

const manualReleaseCollaboratorCreateSchema = Joi.object({
  id_collaborator_document_type: Joi.number().integer().positive().required(),
  id_collaborator_role: Joi.number().integer().positive().required(),
  document: Joi.string().trim().min(1).max(50).required(),
  name: Joi.string().trim().max(200).required(),
  rg: Joi.string().trim().max(30).allow("", null).optional(),
  phone: Joi.string().trim().max(30).allow("", null).optional(),
});

const manualReleaseSchema = Joi.object({
  id_company: Joi.number().integer().positive().required().messages({
    "any.required": "Informe a empresa.",
  }),
  id_setor: Joi.number().integer().positive().required().messages({
    "any.required": "Informe o setor aprovador.",
  }),
  finalidade: Joi.string().trim().max(500).required().messages({
    "string.empty": "Informe o nome do evento.",
    "any.required": "Informe o nome do evento.",
  }),
  observacao: Joi.string().trim().max(500).required().messages({
    "string.empty": "Informe a descrição do serviço.",
    "any.required": "Informe a descrição do serviço.",
  }),
  /** IDs de colaboradores já cadastrados (função vem do cadastro de cada um). */
  id_collaborators: Joi.array()
    .items(Joi.number().integer().positive())
    .unique()
    .max(50)
    .optional(),
  /** Novos cadastros a incluir no mesmo acesso. */
  collaborators: Joi.array().items(manualReleaseCollaboratorCreateSchema).max(20).optional(),
})
  .or("id_collaborators", "collaborators")
  .messages({
    "object.missing": "Selecione ao menos um colaborador.",
  })
  .custom((value, helpers) => {
    const ids = value.id_collaborators || [];
    const creates = value.collaborators || [];
    if (!ids.length && !creates.length) {
      return helpers.message("Selecione ao menos um colaborador.");
    }
    return value;
  });

const manualReleaseSearchSchema = Joi.object({
  document: Joi.string().trim().min(1).max(50).required().messages({
    "any.required": "Informe o documento.",
    "string.empty": "Informe o documento.",
  }),
  id_collaborator_document_type: Joi.number().integer().positive().required().messages({
    "any.required": "Informe o tipo de documento.",
  }),
});

const ISO_DATE = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .messages({
    "string.pattern.base": "Data inválida. Use o formato YYYY-MM-DD.",
  });

const calendarQuerySchema = Joi.object({
  from: ISO_DATE.required().messages({
    "any.required": "Informe a data inicial (from).",
  }),
  to: ISO_DATE.required().messages({
    "any.required": "Informe a data final (to).",
  }),
})
  .custom((value, helpers) => {
    if (value.to < value.from) {
      return helpers.message("A data final deve ser maior ou igual à data inicial.");
    }
    const fromMs = Date.parse(`${value.from}T00:00:00Z`);
    const toMs = Date.parse(`${value.to}T00:00:00Z`);
    const days = Math.round((toMs - fromMs) / 86400000) + 1;
    if (days > 92) {
      return helpers.message("O intervalo máximo do calendário é de 92 dias.");
    }
    return value;
  });

const calendarDetailQuerySchema = Joi.object({
  kind: Joi.string().valid("event", "service").required().messages({
    "any.only": "Informe kind=event ou kind=service.",
    "any.required": "Informe o tipo (kind).",
  }),
  source_id: Joi.number().integer().positive().required().messages({
    "any.required": "Informe o identificador (source_id).",
  }),
  date: ISO_DATE.required().messages({
    "any.required": "Informe a data (date).",
  }),
});

module.exports = {
  eventValidateSchema,
  eventSubstituteSchema,
  serviceValidateSchema,
  serviceSubstituteSchema,
  manualReleaseSchema,
  manualReleaseSearchSchema,
  calendarQuerySchema,
  calendarDetailQuerySchema,
};
