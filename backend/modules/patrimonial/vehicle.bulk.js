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

function normalizeFleetVehicleBulkRow(raw) {
  const mapped = {};
  for (const [key, value] of Object.entries(raw || {})) {
    mapped[normalizeKey(key)] = value;
  }
  const plate = mapped.plate != null ? String(mapped.plate).trim() : "";
  return {
    id_company: parsePositiveInt(mapped.id_company ?? mapped.empresa_id),
    plate: plate ? normalizePlate(plate) : "",
    brand: optionalTrim(mapped.brand) || optionalTrim(mapped.marca),
    model: optionalTrim(mapped.model) || optionalTrim(mapped.modelo),
    color: optionalTrim(mapped.color) || optionalTrim(mapped.cor),
    type: optionalTrim(mapped.type) || optionalTrim(mapped.tipo),
    description:
      optionalTrim(mapped.description) || optionalTrim(mapped.descricao),
  };
}

function isEmptyFleetVehicleBulkRow(raw) {
  const n = normalizeFleetVehicleBulkRow(raw);
  return (
    !n.plate &&
    !Number.isFinite(n.id_company) &&
    !n.brand &&
    !n.model &&
    !n.color &&
    !n.type &&
    !n.description
  );
}

module.exports = {
  parseBulkFile,
  normalizeFleetVehicleBulkRow,
  isEmptyFleetVehicleBulkRow,
};
