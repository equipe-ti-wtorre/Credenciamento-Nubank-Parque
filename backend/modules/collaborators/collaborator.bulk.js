const path = require("path");
const { Readable } = require("stream");
const csv = require("csv-parser");
const XLSX = require("xlsx");
const AppError = require("../../utils/AppError");

function isExcelFile(mimetype, originalname) {
  const ext = path.extname(originalname || "").toLowerCase();
  return (
    ext === ".xlsx" ||
    ext === ".xls" ||
    mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimetype === "application/vnd.ms-excel"
  );
}

function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from(buffer)
      .pipe(csv({ mapHeaders: ({ header }) => String(header || "").trim() }))
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
}

async function parseBulkFile(buffer, mimetype, originalname) {
  if (!buffer?.length) throw new AppError("Arquivo vazio.", 400);
  if (isExcelFile(mimetype, originalname)) {
    return parseExcelBuffer(buffer);
  }
  return parseCsvBuffer(buffer);
}

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

function normalizeBulkRow(raw) {
  const mapped = {};
  for (const [key, value] of Object.entries(raw || {})) {
    mapped[normalizeKey(key)] = value;
  }
  return {
    document: mapped.document != null ? String(mapped.document).trim() : "",
    id_collaborator_document_type: parsePositiveInt(mapped.id_collaborator_document_type),
    name: mapped.name != null ? String(mapped.name).trim() : "",
    id_collaborator_role: parsePositiveInt(mapped.id_collaborator_role),
    rg: mapped.rg != null && String(mapped.rg).trim() !== "" ? String(mapped.rg).trim() : undefined,
    phone:
      mapped.phone != null && String(mapped.phone).trim() !== ""
        ? String(mapped.phone).trim()
        : undefined,
  };
}

function isEmptyBulkRow(raw) {
  const n = normalizeBulkRow(raw);
  return (
    !n.document &&
    !n.name &&
    !Number.isFinite(n.id_collaborator_document_type) &&
    !Number.isFinite(n.id_collaborator_role)
  );
}

module.exports = {
  parseBulkFile,
  normalizeBulkRow,
  isEmptyBulkRow,
};
