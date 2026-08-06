/**
 * Compara campos editáveis entre cadastro atual e linha da planilha.
 * Normaliza máscara/pontuação/caixa (UpperCamelCase) antes de comparar;
 * null/undefined/"" equivalentes.
 */

const { normalizeCpf } = require("../../utils/cpf");
const { normalizePlate } = require("../../utils/plate");

const DIGIT_DOC_FIELDS = new Set(["cpf", "document", "documento"]);
const DIGIT_PHONE_FIELDS = new Set(["phone", "telefone"]);
const RG_FIELDS = new Set(["rg"]);
const PLATE_FIELDS = new Set(["plate", "placa"]);
const ID_FIELDS = new Set(["id_collaborator_role", "id_collaborator_document_type"]);

function normalizeComparable(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value).trim();
}

function collapseSpaces(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Title Case / UpperCamelCase por palavra (locale pt-BR).
 * JOÃO DA SILVA → João Da Silva
 */
function toUpperCamelCase(value) {
  const collapsed = collapseSpaces(value);
  if (!collapsed) return "";
  return collapsed
    .split(" ")
    .map((word) => {
      if (!word) return "";
      const lower = word.toLocaleLowerCase("pt-BR");
      const first = lower.charAt(0).toLocaleUpperCase("pt-BR");
      return first + lower.slice(1);
    })
    .join(" ");
}

function normalizeRg(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("pt-BR")
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Normaliza valor para comparação, conforme o nome do campo.
 * @param {string} field
 * @param {unknown} value
 */
function normalizeForField(field, value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";

  const key = String(field || "").trim();

  if (ID_FIELDS.has(key)) {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : normalizeComparable(value);
  }
  if (DIGIT_DOC_FIELDS.has(key)) {
    return normalizeCpf(value);
  }
  if (DIGIT_PHONE_FIELDS.has(key)) {
    return String(value).replace(/\D/g, "");
  }
  if (RG_FIELDS.has(key)) {
    return normalizeRg(value);
  }
  if (PLATE_FIELDS.has(key)) {
    return normalizePlate(value);
  }
  // Textos de texto e demais strings: UpperCamelCase (Title Case)
  return toUpperCamelCase(String(value));
}

/**
 * @param {Record<string, unknown>} existing
 * @param {Record<string, unknown>} incoming
 * @param {string[]} fields
 * @returns {{ field: string, current: unknown, incoming: unknown }[]}
 */
function buildFieldDiffs(existing, incoming, fields) {
  const diffs = [];
  for (const field of fields) {
    const currentRaw = existing?.[field];
    const incomingRaw = incoming?.[field];
    if (incomingRaw === undefined) continue;
    const current = normalizeForField(field, currentRaw);
    const next = normalizeForField(field, incomingRaw);
    if (current !== next) {
      diffs.push({
        field,
        current: currentRaw == null || currentRaw === "" ? null : currentRaw,
        incoming: incomingRaw == null || incomingRaw === "" ? null : incomingRaw,
      });
    }
  }
  return diffs;
}

/**
 * Monta patch a partir dos campos escolhidos e do incoming da sessão.
 * @param {Record<string, unknown>} incoming
 * @param {string[]|undefined} fields
 * @param {string[]} allowedFields
 */
function pickUpdatePatch(incoming, fields, allowedFields) {
  const selected = Array.isArray(fields) && fields.length
    ? fields.filter((f) => allowedFields.includes(f))
    : allowedFields.filter((f) => incoming[f] !== undefined);
  const patch = {};
  for (const field of selected) {
    if (incoming[field] !== undefined) {
      patch[field] = incoming[field];
    }
  }
  return patch;
}

function summarizePreviewRows(rows) {
  const counts = { create: 0, update: 0, link: 0, error: 0 };
  for (const row of rows) {
    if (counts[row.status] != null) counts[row.status] += 1;
  }
  return {
    total: rows.length,
    ...counts,
  };
}

module.exports = {
  normalizeComparable,
  normalizeForField,
  toUpperCamelCase,
  buildFieldDiffs,
  pickUpdatePatch,
  summarizePreviewRows,
};
