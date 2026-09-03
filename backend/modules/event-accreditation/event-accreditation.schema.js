const Joi = require("joi");

const EVENT_KINDS = ["SHOWDAY", "JOGO"];
const BRACELET_KINDS = ["SHOWDAY", "JOGO", "BOTH"];
const BRACELET_ICONS = [
  "chevrons",
  "star",
  "wrench",
  "music",
  "users",
  "door",
  "utensils",
  "mic",
  "walk",
  "briefcase",
  "binoculars",
  "shield",
];
const BRACELET_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_BRACELET_ICON = "chevrons";
const DEFAULT_BRACELET_COLOR = "#6B4C9A";

function toDateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value;
}

function isIsoDay(value) {
  const day = toDateOnly(value);
  return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function normalizeEventDates(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return [...new Set(list.map(isIsoDay).filter(Boolean))].sort();
}

function toSaoPauloDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

const createSchema = Joi.object({
  name: Joi.string().trim().max(200).required(),
  event_kind: Joi.string()
    .valid(...EVENT_KINDS)
    .required(),
  start: Joi.alternatives().try(Joi.date().iso(), Joi.string().isoDate()).optional(),
  end: Joi.alternatives().try(Joi.date().iso(), Joi.string().isoDate()).optional(),
  event_dates: Joi.array()
    .items(Joi.alternatives().try(Joi.date().iso(), Joi.string()))
    .min(1)
    .optional(),
  inscription_start: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().isoDate())
    .required(),
  inscription_end: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().isoDate())
    .required(),
  id_setor: Joi.number().integer().positive().required(),
  companies: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
  bracelet_types: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .required()
    .messages({
      "array.min": "Selecione ao menos um tipo de pulseira.",
      "any.required": "Selecione ao menos um tipo de pulseira.",
    }),
  internal_enabled: Joi.boolean().optional(),
  internal_bracelet_types: Joi.array()
    .items(Joi.number().integer().positive())
    .optional(),
})
  .custom((value, helpers) => {
    const dates = value.event_dates?.length
      ? normalizeEventDates(value.event_dates)
      : normalizeEventDates([value.start, value.end].filter(Boolean));
    if (!dates.length) return helpers.error("ea.eventDates");
    value.event_dates = dates;
    value.start = dates[0];
    value.end = dates[dates.length - 1];
    const insStart = new Date(value.inscription_start);
    const insEnd = new Date(value.inscription_end);
    if (Number.isNaN(insStart.getTime()) || Number.isNaN(insEnd.getTime())) {
      return helpers.error("ea.inscriptionInvalid");
    }
    if (insStart > insEnd) return helpers.error("ea.inscriptionRange");
    const firstDay = dates[0];
    const insEndDay = toSaoPauloDate(insEnd);
    if (firstDay && insEndDay && insEndDay > firstDay) {
      return helpers.error("ea.inscriptionAfterEvent");
    }
    if (value.internal_enabled && !(value.internal_bracelet_types || []).length) {
      return helpers.error("ea.internalBracelets");
    }
    return value;
  })
  .messages({
    "ea.eventDates": "Selecione ao menos um dia do evento.",
    "ea.dateRange": "A data de início deve ser anterior ou igual à data de término.",
    "ea.inscriptionInvalid": "Informe o período de inscrição com data e horário válidos.",
    "ea.inscriptionRange": "O início da inscrição deve ser anterior ou igual ao limite.",
    "ea.inscriptionAfterEvent": "A janela de indicação não pode fechar depois do primeiro dia do evento.",
    "ea.internalBracelets": "Selecione ao menos um tipo de pulseira para os colaboradores internos.",
  });

const updateSchema = Joi.object({
  name: Joi.string().trim().max(200).optional(),
  start: Joi.alternatives().try(Joi.date().iso(), Joi.string().isoDate()).optional(),
  end: Joi.alternatives().try(Joi.date().iso(), Joi.string().isoDate()).optional(),
  inscription_start: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().isoDate())
    .optional(),
  inscription_end: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().isoDate())
    .optional(),
  id_setor: Joi.number().integer().positive().optional(),
  companies: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .optional()
    .messages({
      "array.min": "Selecione ao menos uma empresa para indicar colaboradores.",
    }),
  bracelet_types: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .optional()
    .messages({
      "array.min": "Selecione ao menos um tipo de pulseira.",
    }),
  internal_enabled: Joi.boolean().optional(),
  internal_bracelet_types: Joi.array()
    .items(Joi.number().integer().positive())
    .optional(),
  event_dates: Joi.array()
    .items(Joi.alternatives().try(Joi.date().iso(), Joi.string()))
    .min(1)
    .optional(),
})
  .min(1)
  .custom((value, helpers) => {
    if (value.event_dates != null) {
      const dates = normalizeEventDates(value.event_dates);
      if (!dates.length) return helpers.error("ea.eventDates");
      value.event_dates = dates;
      value.start = dates[0];
      value.end = dates[dates.length - 1];
    } else if (value.start && value.end && toDateOnly(value.start) > toDateOnly(value.end)) {
      return helpers.error("ea.dateRange");
    }
    if (value.inscription_start && value.inscription_end) {
      if (new Date(value.inscription_start) > new Date(value.inscription_end)) {
        return helpers.error("ea.inscriptionRange");
      }
    }
    const firstDay =
      value.event_dates?.[0] || (value.start != null ? toDateOnly(value.start) : null);
    const insEnd = value.inscription_end != null ? new Date(value.inscription_end) : null;
    const insEndDay = insEnd && !Number.isNaN(insEnd.getTime()) ? toSaoPauloDate(insEnd) : null;
    if (firstDay && insEndDay && insEndDay > firstDay) {
      return helpers.error("ea.inscriptionAfterEvent");
    }
    if (value.internal_enabled && value.internal_bracelet_types != null && !value.internal_bracelet_types.length) {
      return helpers.error("ea.internalBracelets");
    }
    return value;
  })
  .messages({
    "ea.eventDates": "Selecione ao menos um dia do evento.",
    "ea.dateRange": "A data de início deve ser anterior ou igual à data de término.",
    "ea.inscriptionRange": "O início da inscrição deve ser anterior ou igual ao limite.",
    "ea.inscriptionAfterEvent": "A janela de indicação não pode fechar depois do primeiro dia do evento.",
    "ea.internalBracelets": "Selecione ao menos um tipo de pulseira para os colaboradores internos.",
  });

const statusSchema = Joi.object({
  ativo: Joi.boolean().required(),
});

const collaboratorSchema = Joi.object({
  id_collaborator: Joi.number().integer().positive().required(),
  id_collaborator_role: Joi.number().integer().positive().required(),
  id_bracelet_type: Joi.number().integer().positive().required(),
});

const braceletCreateSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  event_kind: Joi.string()
    .valid(...BRACELET_KINDS)
    .required(),
  icon: Joi.string()
    .valid(...BRACELET_ICONS)
    .optional(),
  color: Joi.string().pattern(BRACELET_COLOR_RE).optional(),
  ativo: Joi.boolean().optional(),
});

const braceletUpdateSchema = Joi.object({
  name: Joi.string().trim().max(100).optional(),
  event_kind: Joi.string()
    .valid(...BRACELET_KINDS)
    .optional(),
  icon: Joi.string()
    .valid(...BRACELET_ICONS)
    .optional(),
  color: Joi.string().pattern(BRACELET_COLOR_RE).optional(),
  ativo: Joi.boolean().optional(),
}).min(1);

const BLOCK_REASONS = [
  "Documento divergente",
  "Sem antecedente liberado",
  "Foto reprovada",
  "Fora do escopo do evento",
  "Bloqueio permanente (histórico)",
  "Outro",
];

const decideSchema = Joi.object({
  action: Joi.string().valid("approve", "block", "unblock").required(),
  target: Joi.string().valid("company", "internal").default("company"),
  ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
  reason: Joi.string()
    .valid(...BLOCK_REASONS)
    .when("action", {
      is: "block",
      then: Joi.required(),
      otherwise: Joi.optional().allow("", null),
    }),
  note: Joi.string().trim().max(160).allow("", null).optional(),
});

const changeBraceletSchema = Joi.object({
  target: Joi.string().valid("company", "internal").required(),
  id: Joi.number().integer().positive().optional(),
  ids: Joi.array().items(Joi.number().integer().positive()).min(1).optional(),
  id_bracelet_type: Joi.number().integer().positive().required(),
})
  .or("id", "ids")
  .custom((value) => {
    const ids = [...(value.ids || [])];
    if (value.id) ids.push(value.id);
    value.ids = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
    return value;
  });

const notifyCompaniesSchema = Joi.object({
  id_company: Joi.number().integer().positive().optional(),
});

const internalRegisterSchema = Joi.object({
  id_bracelet_type: Joi.number().integer().positive().required(),
});

const inviteSchema = Joi.object({
  subject: Joi.string().trim().max(255).required(),
  html: Joi.string().trim().min(1).required(),
});

const inviteSendSchema = Joi.object({
  mode: Joi.string().valid("now", "schedule", "skip").required(),
});

module.exports = {
  EVENT_KINDS,
  BRACELET_KINDS,
  BRACELET_ICONS,
  DEFAULT_BRACELET_ICON,
  DEFAULT_BRACELET_COLOR,
  BLOCK_REASONS,
  toDateOnly,
  toSaoPauloDate,
  normalizeEventDates,
  createSchema,
  updateSchema,
  statusSchema,
  collaboratorSchema,
  braceletCreateSchema,
  braceletUpdateSchema,
  decideSchema,
  changeBraceletSchema,
  notifyCompaniesSchema,
  internalRegisterSchema,
  inviteSchema,
  inviteSendSchema,
};
