const Joi = require("joi");
const { normalizePlate, isValidPlate } = require("../../utils/plate");
const { isValidCnpj, normalizeCnpj } = require("../../utils/cnpj");
const { isValidCpf, normalizeCpf } = require("../../utils/cpf");

const locationTypes = ["DEPOSITO", "LOJA"];

const locationCreateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  type: Joi.string().valid(...locationTypes).default("DEPOSITO"),
});

const locationUpdateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  type: Joi.string().valid(...locationTypes),
  status: Joi.boolean(),
}).min(1);

const productCreateSchema = Joi.object({
  description: Joi.string().trim().min(1).max(200).required(),
  unit_measure: Joi.string().trim().min(1).max(40).required(),
  manufacturer: Joi.string().trim().max(120).allow("", null),
});

const productUpdateSchema = Joi.object({
  description: Joi.string().trim().min(1).max(200),
  unit_measure: Joi.string().trim().min(1).max(40),
  manufacturer: Joi.string().trim().max(120).allow("", null),
  status: Joi.boolean(),
}).min(1);

const movementItemSchema = Joi.object({
  id_product: Joi.number().integer().positive().required(),
  id_storage_location: Joi.number().integer().positive().required(),
  quantity: Joi.number().positive().required(),
});

const documentSchema = Joi.string()
  .custom((v, helpers) => {
    const digits = String(v || "").replace(/\D/g, "");
    if (digits.length === 11) {
      if (!isValidCpf(digits)) return helpers.error("any.invalid");
      return normalizeCpf(digits);
    }
    if (digits.length === 14) {
      if (!isValidCnpj(digits)) return helpers.error("any.invalid");
      return normalizeCnpj(digits);
    }
    return helpers.error("any.invalid");
  })
  .messages({ "any.invalid": "CPF/CNPJ inválido." });

const plateSchema = Joi.string().custom((v, helpers) => {
  const plate = normalizePlate(v);
  if (!isValidPlate(plate)) {
    return helpers.message("Placa inválida (use ABC1234 ou ABC1D23).");
  }
  return plate;
});

const movementPayloadSchema = Joi.object({
  // FASE 5: o formulário sempre envia natureza/origem
  movement_nature: Joi.string().valid("ESTOQUE", "ENTREGA").required(),
  origin_type: Joi.string().valid("CREDENCIADA", "EVENTUAL").required(),
  request_id: Joi.string().guid({ version: "uuidv4" }).optional(),

  id_company: Joi.number()
    .integer()
    .positive()
    .when("origin_type", { is: "CREDENCIADA", then: Joi.required(), otherwise: Joi.forbidden() }),
  id_vehicle: Joi.number()
    .integer()
    .positive()
    .when("origin_type", { is: "CREDENCIADA", then: Joi.required(), otherwise: Joi.forbidden() }),
  id_collaborator: Joi.number()
    .integer()
    .positive()
    .when("origin_type", { is: "EVENTUAL", then: Joi.forbidden(), otherwise: Joi.optional() }),
  id_collaborators: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .when("origin_type", { is: "EVENTUAL", then: Joi.forbidden(), otherwise: Joi.optional() }),

  sender_name: Joi.string()
    .trim()
    .min(2)
    .max(160)
    .when("origin_type", { is: "EVENTUAL", then: Joi.required(), otherwise: Joi.forbidden() }),
  sender_document: documentSchema
    .optional()
    .allow(null, "")
    .when("origin_type", { is: "CREDENCIADA", then: Joi.forbidden() }),
  carrier_name: Joi.string()
    .trim()
    .max(160)
    .optional()
    .allow(null, "")
    .when("origin_type", { is: "CREDENCIADA", then: Joi.forbidden() }),
  driver_name: Joi.string()
    .trim()
    .min(2)
    .max(160)
    .when("origin_type", { is: "EVENTUAL", then: Joi.required(), otherwise: Joi.forbidden() }),
  driver_document: documentSchema.when("origin_type", {
    is: "EVENTUAL",
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  vehicle_plate: plateSchema.when("origin_type", {
    is: "EVENTUAL",
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  trade_name: Joi.string()
    .trim()
    .max(160)
    .optional()
    .allow(null, "")
    .when("origin_type", { is: "CREDENCIADA", then: Joi.forbidden() }),
  ie: Joi.string().trim().max(20).optional().allow(null, "").when("origin_type", {
    is: "CREDENCIADA",
    then: Joi.forbidden(),
  }),
  uf: Joi.string().trim().uppercase().max(2).optional().allow(null, "").when("origin_type", {
    is: "CREDENCIADA",
    then: Joi.forbidden(),
  }),
  municipio: Joi.string().trim().max(120).optional().allow(null, "").when("origin_type", {
    is: "CREDENCIADA",
    then: Joi.forbidden(),
  }),
  cep: Joi.string().trim().max(10).optional().allow(null, "").when("origin_type", {
    is: "CREDENCIADA",
    then: Joi.forbidden(),
  }),
  endereco: Joi.string().trim().max(255).optional().allow(null, "").when("origin_type", {
    is: "CREDENCIADA",
    then: Joi.forbidden(),
  }),
  external_origem: Joi.string()
    .valid("OCR", "MANUAL", "CHAVE_ACESSO", "IMPORT")
    .optional()
    .when("origin_type", { is: "CREDENCIADA", then: Joi.forbidden() }),

  invoice_number: Joi.string().trim().min(1).max(255).optional().allow(null, ""),
  no_invoice_reason: Joi.string()
    .valid("DECLARACAO_CONTEUDO", "ENCOMENDA_PESSOAL", "REMESSA_SEM_NOTA", "OUTRO")
    .optional()
    .allow(null),

  volumes: Joi.number()
    .integer()
    .min(1)
    .max(999)
    .when("movement_nature", { is: "ENTREGA", then: Joi.required(), otherwise: Joi.optional().allow(null) }),
  content_description: Joi.string()
    .trim()
    .max(255)
    .when("movement_nature", {
      is: "ENTREGA",
      then: Joi.required(),
      otherwise: Joi.optional().allow(null, ""),
    }),

  items: Joi.array()
    .items(movementItemSchema)
    .when("movement_nature", {
      is: "ESTOQUE",
      then: Joi.array().items(movementItemSchema).min(1).required(),
      otherwise: Joi.array().items(movementItemSchema).max(0).default([]),
    }),

  id_recipient_collaborator: Joi.number().integer().positive().optional().allow(null),
  recipient_area: Joi.string().trim().max(120).optional().allow(null, ""),
}).custom((value, helpers) => {
    const nf = value.invoice_number == null || String(value.invoice_number).trim() === ""
      ? null
      : String(value.invoice_number).trim();
    value.invoice_number = nf;

    if (value.movement_nature === "ENTREGA" && !nf && !value.no_invoice_reason) {
      value.no_invoice_reason = "ENCOMENDA_PESSOAL";
    }
    if (!nf && !value.no_invoice_reason) {
      return helpers.message("Informe o número da NF ou o motivo da ausência.");
    }

    if (value.sender_document === "") value.sender_document = null;
    if (value.carrier_name === "") value.carrier_name = null;
    if (value.recipient_area === "") value.recipient_area = null;
    if (value.content_description === "") value.content_description = null;

    if (value.origin_type === "CREDENCIADA") {
      const fromList = Array.isArray(value.id_collaborators)
        ? value.id_collaborators.map(Number).filter((id) => Number.isFinite(id) && id > 0)
        : [];
      const ids = [...new Set(fromList.length ? fromList : [Number(value.id_collaborator)])];
      if (!ids.length || !ids[0]) {
        return helpers.message("Informe ao menos um colaborador na relação (motorista).");
      }
      value.id_collaborators = ids;
      value.id_collaborator = ids[0];
    }

    if (value.movement_nature === "ENTREGA") {
      const hasRecipient =
        Number(value.id_recipient_collaborator) > 0 ||
        (value.recipient_area && String(value.recipient_area).trim());
      if (!hasRecipient) {
        return helpers.message("Informe o destinatário (colaborador ou área).");
      }
    }

    return value;
  });

const historyQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  from: Joi.string().allow(""),
  to: Joi.string().allow(""),
  movement_type: Joi.string().valid("ENTRADA", "SAIDA").allow(""),
  id_company: Joi.number().integer().positive().allow(""),
});

const dashboardQuerySchema = Joi.object({
  days: Joi.number().integer().min(1).max(90).default(7),
});

const lookupPlateQuerySchema = Joi.object({
  plate: Joi.string().allow("", null),
});

const externalSuggestQuerySchema = Joi.object({
  q: Joi.string().allow("", null).default(""),
});

const externalListQuerySchema = Joi.object({
  revisado: Joi.number().valid(0, 1).optional(),
  q: Joi.string().allow("", null).default(""),
});

const externalPatchSchema = Joi.object({
  legal_name: Joi.string().trim().min(2).max(160),
  trade_name: Joi.string().trim().max(160).allow(null, ""),
  ie: Joi.string().trim().max(20).allow(null, ""),
  uf: Joi.string().trim().length(2).uppercase().allow(null, ""),
  municipio: Joi.string().trim().max(120).allow(null, ""),
  cep: Joi.string().trim().max(8).allow(null, ""),
  endereco: Joi.string().trim().max(255).allow(null, ""),
  revisado: Joi.boolean(),
}).min(1);

const externalMergeSchema = Joi.object({
  id_target: Joi.number().integer().positive().required(),
});

module.exports = {
  locationCreateSchema,
  locationUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
  movementPayloadSchema,
  historyQuerySchema,
  dashboardQuerySchema,
  lookupPlateQuerySchema,
  externalSuggestQuerySchema,
  externalListQuerySchema,
  externalPatchSchema,
  externalMergeSchema,
};
