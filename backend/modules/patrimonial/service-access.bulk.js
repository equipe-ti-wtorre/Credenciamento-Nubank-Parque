const { parseBulkFile } = require("../collaborators/collaborator.bulk");
const { normalizePlate } = require("../../utils/plate");

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function parsePositiveInt(value) {
  if (value === undefined || value === null || value === "") return NaN;
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.trunc(n);
}

function optionalTrim(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s !== "" ? s : undefined;
}

function normalizeCollaboratorBulkRow(raw) {
  const mapped = {};
  for (const [key, value] of Object.entries(raw || {})) {
    mapped[normalizeKey(key)] = value;
  }
  return {
    document: mapped.document != null ? String(mapped.document).trim() : "",
    id_collaborator_document_type: parsePositiveInt(
      mapped.id_collaborator_document_type ?? mapped.document_type_id,
    ),
    document_type:
      optionalTrim(mapped.document_type) ||
      optionalTrim(mapped.tipo_documento) ||
      "",
    name: mapped.name != null ? String(mapped.name).trim() : "",
    id_collaborator_role: parsePositiveInt(mapped.id_collaborator_role),
    role: mapped.role != null ? String(mapped.role).trim() : "",
    rg: optionalTrim(mapped.rg),
    phone: optionalTrim(mapped.phone) || optionalTrim(mapped.telefone),
  };
}

function normalizeVehicleBulkRow(raw) {
  const mapped = {};
  for (const [key, value] of Object.entries(raw || {})) {
    mapped[normalizeKey(key)] = value;
  }
  const plate = mapped.plate != null ? String(mapped.plate).trim() : "";
  return {
    plate: plate ? normalizePlate(plate) : "",
    brand: optionalTrim(mapped.brand) || optionalTrim(mapped.marca),
    model: optionalTrim(mapped.model) || optionalTrim(mapped.modelo),
    color: optionalTrim(mapped.color) || optionalTrim(mapped.cor),
    type: optionalTrim(mapped.type) || optionalTrim(mapped.tipo),
    description:
      optionalTrim(mapped.description) || optionalTrim(mapped.descricao),
  };
}

function isEmptyCollaboratorBulkRow(raw) {
  const n = normalizeCollaboratorBulkRow(raw);
  return (
    !n.document &&
    !n.name &&
    !Number.isFinite(n.id_collaborator_document_type) &&
    !n.document_type &&
    !Number.isFinite(n.id_collaborator_role) &&
    !n.role
  );
}

function isEmptyVehicleBulkRow(raw) {
  const n = normalizeVehicleBulkRow(raw);
  return (
    !n.plate &&
    !n.brand &&
    !n.model &&
    !n.color &&
    !n.type &&
    !n.description
  );
}

function hasCollaboratorCreateFields(payload) {
  return !!(
    payload.document &&
    payload.name &&
    (Number.isFinite(payload.id_collaborator_document_type) || payload.document_type) &&
    (Number.isFinite(payload.id_collaborator_role) || payload.role)
  );
}

function hasVehicleCreateFields(payload) {
  return !!(
    payload.plate &&
    payload.brand &&
    payload.model &&
    payload.color &&
    payload.type
  );
}

module.exports = {
  parseBulkFile,
  normalizeCollaboratorBulkRow,
  normalizeVehicleBulkRow,
  isEmptyCollaboratorBulkRow,
  isEmptyVehicleBulkRow,
  hasCollaboratorCreateFields,
  hasVehicleCreateFields,
};
