/**
 * Compara campos editáveis entre cadastro atual e linha da planilha.
 * Valores normalizados como string trimada; null/undefined/"" equivalentes.
 */

function normalizeComparable(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value).trim();
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
    const current = normalizeComparable(currentRaw);
    const next = normalizeComparable(incomingRaw);
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
  buildFieldDiffs,
  pickUpdatePatch,
  summarizePreviewRows,
};
