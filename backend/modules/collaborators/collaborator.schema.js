const Joi = require("joi");
const db = require("../../config/db");
const { isValidCpf, normalizeCpf } = require("../../utils/cpf");

const DOC_TYPE_CPF = "CPF";
const DOC_TYPE_RG = "RG";
const DOC_TYPE_PASSPORT = "Passaporte";

let documentTypeCache = null;

async function loadDocumentTypeCache() {
  if (documentTypeCache) return documentTypeCache;
  const [rows] = await db.execute(
    "SELECT id_collaborator_document_type, description FROM collaborator_document_type",
  );
  documentTypeCache = {};
  for (const row of rows) {
    documentTypeCache[row.id_collaborator_document_type] = row.description;
  }
  return documentTypeCache;
}

function invalidateDocumentTypeCache() {
  documentTypeCache = null;
}

function normalizeAlphanumericDocument(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase()
    .slice(0, 30);
}

async function validateDocumentByType(document, idDocumentType) {
  const cache = await loadDocumentTypeCache();
  const typeDesc = cache[idDocumentType];
  if (!typeDesc) {
    return { error: "Tipo de documento inválido." };
  }

  if (typeDesc === DOC_TYPE_CPF) {
    const normalized = normalizeCpf(document);
    if (!isValidCpf(normalized)) {
      return { error: "CPF inválido." };
    }
    return { value: normalized, typeDesc };
  }

  const normalized = normalizeAlphanumericDocument(document);
  if (!/^[A-Z0-9]{5,30}$/.test(normalized)) {
    return {
      error:
        typeDesc === DOC_TYPE_PASSPORT
          ? "Passaporte inválido. Use 5 a 30 caracteres alfanuméricos."
          : "RG inválido. Use 5 a 30 caracteres alfanuméricos.",
    };
  }
  return { value: normalized, typeDesc };
}

const documentField = Joi.string().required();

const collaboratorCreateSchema = Joi.object({
  id_collaborator_document_type: Joi.number().integer().positive().required(),
  id_collaborator_role: Joi.number().integer().positive().required(),
  document: documentField,
  name: Joi.string().max(200).required(),
  rg: Joi.string().max(30).allow("", null).optional(),
  phone: Joi.string().max(30).allow("", null).optional(),
  status: Joi.boolean().optional(),
});

const collaboratorUpdateSchema = Joi.object({
  id_collaborator_document_type: Joi.number().integer().positive().optional(),
  id_collaborator_role: Joi.number().integer().positive().optional(),
  document: documentField.optional(),
  name: Joi.string().max(200).optional(),
  rg: Joi.string().max(30).allow("", null).optional(),
  phone: Joi.string().max(30).allow("", null).optional(),
  status: Joi.boolean().optional(),
}).min(1);

const collaboratorStatusSchema = Joi.object({
  status: Joi.boolean().required(),
});

const collaboratorSearchSchema = Joi.object({
  document: documentField,
  id_collaborator_document_type: Joi.number().integer().positive().required(),
});

const blacklistSchema = Joi.object({
  reason: Joi.string().min(10).max(500).required(),
});

const roleCreateSchema = Joi.object({
  description: Joi.string().trim().min(2).max(100).required(),
});

const roleUpdateSchema = Joi.object({
  description: Joi.string().trim().min(2).max(100).required(),
});

async function validateAndNormalizeCollaboratorPayload(payload, { isUpdate = false } = {}) {
  const base = isUpdate ? collaboratorUpdateSchema : collaboratorCreateSchema;
  const { error, value } = base.validate(payload);
  if (error) {
    return { error: error.details[0].message };
  }

  if (value.document != null || value.id_collaborator_document_type != null) {
    const docTypeId = value.id_collaborator_document_type;
    if (docTypeId == null) {
      return { error: "id_collaborator_document_type é obrigatório ao informar document." };
    }
    const docResult = await validateDocumentByType(value.document, docTypeId);
    if (docResult.error) {
      return { error: docResult.error };
    }
    value.document = docResult.value;
  }

  if (value.rg !== undefined) {
    value.rg = value.rg ? String(value.rg).trim() : null;
  }
  if (value.phone !== undefined) {
    value.phone = value.phone ? String(value.phone).trim() : null;
  }

  return { value };
}

async function validateSearchQuery(query) {
  const { error, value } = collaboratorSearchSchema.validate(query);
  if (error) {
    return { error: error.details[0].message };
  }

  const docResult = await validateDocumentByType(
    value.document,
    value.id_collaborator_document_type,
  );
  if (docResult.error) {
    return { error: docResult.error };
  }

  return {
    value: {
      document: docResult.value,
      id_collaborator_document_type: value.id_collaborator_document_type,
    },
  };
}

module.exports = {
  DOC_TYPE_CPF,
  DOC_TYPE_RG,
  DOC_TYPE_PASSPORT,
  collaboratorCreateSchema,
  collaboratorUpdateSchema,
  collaboratorStatusSchema,
  collaboratorSearchSchema,
  blacklistSchema,
  roleCreateSchema,
  roleUpdateSchema,
  validateAndNormalizeCollaboratorPayload,
  validateSearchQuery,
  validateDocumentByType,
  invalidateDocumentTypeCache,
  loadDocumentTypeCache,
};
