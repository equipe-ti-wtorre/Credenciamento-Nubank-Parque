const path = require("path");
const crypto = require("crypto");
const XLSX = require("xlsx");
const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { normalizeCpf } = require("../../utils/cpf");
const { normalizePlate, isValidPlate } = require("../../utils/plate");
const {
  validateDocumentByType,
  validateAndNormalizeCollaboratorPayload,
} = require("../collaborators/collaborator.schema");
const {
  savePreviewSession,
  getPreviewSession,
  deletePreviewSession,
} = require("../bulk/previewSession");
const { buildFieldDiffs, pickUpdatePatch } = require("../bulk/diff");
const { buildServiceAccessUnifiedBulkTemplate } = require("../../utils/bulkTemplateXlsx");
const { STATUS_APROVADO } = require("../credentials/credentials.schema");

const KIND = "service_access_unified";
const MAX_ROWS = 500;
const MASTER_UPDATE_FIELDS = ["name", "rg", "phone"];
const PREVIEW_TOKEN_CONSUMIDO = "PREVIEW_TOKEN_CONSUMIDO";

const COLAB_REQUIRED_HEADERS = [
  "documento",
  "tipo_de_documento",
  "nome_completo",
  "funcao_cargo",
];
const VEIC_REQUIRED_HEADERS = ["placa", "marca", "modelo"];

function foldText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeHeader(key) {
  return String(key || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function optionalTrim(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s !== "" ? s : undefined;
}

function isExcelFile(mimetype, originalname) {
  const ext = path.extname(originalname || "").toLowerCase();
  return (
    ext === ".xlsx" ||
    ext === ".xls" ||
    mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimetype === "application/vnd.ms-excel"
  );
}

function findSheetName(workbook, wanted) {
  const wantedFold = foldText(wanted);
  return workbook.SheetNames.find((n) => foldText(n) === wantedFold) || null;
}

function sheetToObjects(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, header: 1 });
  if (!rows.length) return { headers: [], objects: [] };
  const headerRow = rows[0].map((h) => String(h || "").trim());
  const objects = [];
  for (let i = 1; i < rows.length; i++) {
    const line = rows[i];
    if (!line || line.every((c) => String(c || "").trim() === "")) continue;
    const obj = {};
    for (let c = 0; c < headerRow.length; c++) {
      obj[headerRow[c]] = line[c] != null ? line[c] : "";
    }
    objects.push({ line: i + 1, raw: obj });
  }
  return { headers: headerRow, objects };
}

function assertHeaders(headers, required, sheetLabel) {
  const normalized = headers.map(normalizeHeader);
  const missing = required.filter((r) => !normalized.includes(r));
  if (missing.length) {
    throw new AppError(
      `Cabeçalho inválido na aba "${sheetLabel}". Colunas obrigatórias ausentes ou renomeadas.`,
      422,
      true,
      { missing, sheet: sheetLabel },
    );
  }
}

function mapRowByHeaders(raw) {
  const mapped = {};
  for (const [key, value] of Object.entries(raw || {})) {
    mapped[normalizeHeader(key)] = value;
  }
  return mapped;
}

function parseUnifiedWorkbook(buffer, mimetype, originalname) {
  if (!buffer?.length) throw new AppError("Arquivo vazio.", 422);
  if (!isExcelFile(mimetype, originalname)) {
    throw new AppError("Formato inválido. Envie um arquivo .xlsx.", 422);
  }
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  const colName = findSheetName(workbook, "Colaboradores");
  const vehName = findSheetName(workbook, "Veículos");
  if (!colName) {
    throw new AppError('Aba "Colaboradores" não encontrada no arquivo.', 422);
  }
  if (!vehName) {
    throw new AppError('Aba "Veículos" não encontrada no arquivo.', 422);
  }
  const colParsed = sheetToObjects(workbook.Sheets[colName]);
  const vehParsed = sheetToObjects(workbook.Sheets[vehName]);
  assertHeaders(colParsed.headers, COLAB_REQUIRED_HEADERS, "Colaboradores");
  assertHeaders(vehParsed.headers, VEIC_REQUIRED_HEADERS, "Veículos");
  return { collaborators: colParsed.objects, vehicles: vehParsed.objects };
}

function isExampleCollaboratorRow(mapped) {
  const doc = String(mapped.documento || "").trim();
  const name = String(mapped.nome_completo || "").trim();
  return doc === "12345678901" && foldText(name) === foldText("João da Silva");
}

function isExampleVehicleRow(mapped) {
  const plate = normalizePlate(mapped.placa);
  const brand = foldText(mapped.marca);
  return plate === "ABC1D23" && brand === "toyota";
}

function normalizeCollabIncoming(mapped) {
  return {
    documento: mapped.documento != null ? String(mapped.documento).trim() : "",
    tipo_de_documento: optionalTrim(mapped.tipo_de_documento) || "",
    nome_completo: mapped.nome_completo != null ? String(mapped.nome_completo).trim() : "",
    funcao_cargo: optionalTrim(mapped.funcao_cargo) || "",
    rg: optionalTrim(mapped.rg),
    telefone: optionalTrim(mapped.telefone),
  };
}

function normalizeVeicIncoming(mapped) {
  const plateRaw = mapped.placa != null ? String(mapped.placa).trim() : "";
  return {
    placa: plateRaw ? normalizePlate(plateRaw) : "",
    marca: optionalTrim(mapped.marca),
    modelo: optionalTrim(mapped.modelo),
    motorista_documento:
      mapped.motorista_documento != null ? String(mapped.motorista_documento).trim() : "",
    cor: optionalTrim(mapped.cor),
    tipo: optionalTrim(mapped.tipo),
    observacoes: optionalTrim(mapped.observacoes),
  };
}

/** Dados para exibir na revisão do wizard (além da placa). */
function buildVehiclePreviewDados(incoming, { empresa } = {}) {
  return {
    marca: incoming?.marca || null,
    modelo: incoming?.modelo || null,
    cor: incoming?.cor || null,
    tipo: incoming?.tipo || null,
    observacoes: incoming?.observacoes || null,
    empresa: empresa || null,
  };
}

async function loadLookups() {
  const [[types], [roles]] = await Promise.all([
    db.execute(
      "SELECT id_collaborator_document_type, description FROM collaborator_document_type ORDER BY description",
    ),
    db.execute(
      "SELECT id_collaborator_role, description FROM collaborator_role ORDER BY description",
    ),
  ]);
  return { types, roles };
}

function resolveByFoldedDescription(rows, description, idField) {
  const wanted = foldText(description);
  if (!wanted) return null;
  const hit = rows.find((r) => foldText(r.description) === wanted);
  return hit ? { id: hit[idField], description: hit.description } : null;
}

async function findCollaboratorByDocType(document, idDocumentType) {
  const [rows] = await db.execute(
    `SELECT c.*, cdt.description AS document_type_description, cr.description AS role_description
     FROM collaborator c
     INNER JOIN collaborator_document_type cdt
       ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
     LEFT JOIN collaborator_role cr ON cr.id_collaborator_role = c.id_collaborator_role
     WHERE c.document = ? AND c.id_collaborator_document_type = ?
     LIMIT 1`,
    [document, idDocumentType],
  );
  return rows[0] || null;
}

async function findCollaboratorByDocumentAnyNormalized(rawDocument) {
  const trimmed = String(rawDocument || "").trim();
  if (!trimmed) return null;
  const candidates = [trimmed, normalizeCpf(trimmed), trimmed.replace(/\s+/g, "").toUpperCase()];
  const unique = [...new Set(candidates.filter(Boolean))];
  for (const doc of unique) {
    const [rows] = await db.execute(
      `SELECT c.*, cdt.description AS document_type_description
       FROM collaborator c
       INNER JOIN collaborator_document_type cdt
         ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
       WHERE c.document = ? LIMIT 1`,
      [doc],
    );
    if (rows[0]) return rows[0];
  }
  return null;
}

async function isCollaboratorLinked(serviceId, collaboratorId) {
  const [rows] = await db.execute(
    `SELECT id_service_access_collaborator, id_collaborator_role
     FROM service_access_collaborator
     WHERE id_service_access = ? AND id_collaborator = ? LIMIT 1`,
    [serviceId, collaboratorId],
  );
  return rows[0] || null;
}

async function isVehicleLinked(serviceId, vehicleId) {
  const [rows] = await db.execute(
    `SELECT id_service_access_vehicle, id_driver
     FROM service_access_vehicle
     WHERE id_service_access = ? AND id_vehicle = ? LIMIT 1`,
    [serviceId, vehicleId],
  );
  return rows[0] || null;
}

async function findVehicleByPlateCompany(idCompany, plate) {
  const normalized = normalizePlate(plate);
  const [rows] = await db.execute(
    `SELECT v.*, vbl.reason AS blacklist_reason
     FROM vehicle v
     LEFT JOIN vehicle_black_list vbl ON vbl.id_vehicle = v.id_vehicle
     WHERE v.id_company = ? AND v.plate = ? LIMIT 1`,
    [idCompany, normalized],
  );
  return rows[0] || null;
}

async function listLinkedCollaborators(serviceId) {
  const [rows] = await db.execute(
    `SELECT sac.id_collaborator, sac.id_collaborator_role, c.document, c.name,
            cdt.description AS document_type_description,
            cr.description AS role_description
     FROM service_access_collaborator sac
     INNER JOIN collaborator c ON c.id_collaborator = sac.id_collaborator
     INNER JOIN collaborator_document_type cdt
       ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
     LEFT JOIN collaborator_role cr ON cr.id_collaborator_role = sac.id_collaborator_role
     WHERE sac.id_service_access = ?`,
    [serviceId],
  );
  return rows;
}

/** Credenciais só são geradas no workflow de aprovação (generateAccessIds). */
async function maybeGenerateAccessIdForLink() {
  return;
}

function summarizeAxis(rows) {
  const out = {
    novos: 0,
    atualizacoes: 0,
    inalterados: 0,
    erros: 0,
    a_vincular: 0,
    ja_vinculados: 0,
  };
  for (const row of rows) {
    if (row.cadastro === "novo") out.novos += 1;
    else if (row.cadastro === "atualizacao") out.atualizacoes += 1;
    else if (row.cadastro === "inalterado") out.inalterados += 1;
    else if (row.cadastro === "erro") out.erros += 1;
    if (row.vinculo === "a_vincular") out.a_vincular += 1;
    if (row.vinculo === "ja_vinculado") out.ja_vinculados += 1;
  }
  return { ...out, total: rows.length };
}

async function buildUnifiedTemplate() {
  const { types, roles } = await loadLookups();
  return buildServiceAccessUnifiedBulkTemplate({ types, roles });
}

async function resolveDriverFromSheet(rawDocument, spreadsheetByDocument, sessionCollaborators) {
  const candidates = [
    String(rawDocument || "").trim(),
    normalizeCpf(rawDocument),
    String(rawDocument || "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase(),
  ].filter(Boolean);

  for (const doc of candidates) {
    let hit = spreadsheetByDocument.get(doc) || spreadsheetByDocument.get(normalizeCpf(doc));
    if (!hit) {
      for (const [k, v] of spreadsheetByDocument.entries()) {
        if (foldText(k) === foldText(doc) || k === doc) {
          hit = v;
          break;
        }
      }
    }
    if (!hit) continue;
    const sessionRow = sessionCollaborators[hit.sessionIndex];
    if (!sessionRow || sessionRow.cadastro === "erro") {
      return {
        error: `Motorista aponta para colaborador da planilha (linha ${hit.line}) com erro — corrija o colaborador.`,
      };
    }
    return {
      found: true,
      documento: sessionRow.chave?.documento || doc,
      nome: sessionRow.nome || sessionRow.validated?.name || null,
      existingId: sessionRow.existingId || null,
      sessionIndex: hit.sessionIndex,
    };
  }
  return { found: false };
}

function resolveDriverFromLinked(rawDocument, linkedCols) {
  const candidates = [
    String(rawDocument || "").trim(),
    normalizeCpf(rawDocument),
    String(rawDocument || "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase(),
  ].filter(Boolean);
  for (const lc of linkedCols) {
    for (const c of candidates) {
      if (
        lc.document === c ||
        normalizeCpf(lc.document) === normalizeCpf(c) ||
        foldText(lc.document) === foldText(c)
      ) {
        return lc;
      }
    }
  }
  return null;
}

module.exports = {
  KIND,
  PREVIEW_TOKEN_CONSUMIDO,
  MASTER_UPDATE_FIELDS,
  foldText,
  normalizeHeader,
  parseUnifiedWorkbook,
  resolveByFoldedDescription,
  resolveDriverFromSheet,
  resolveDriverFromLinked,
  isExampleCollaboratorRow,
  isExampleVehicleRow,
  mapRowByHeaders,
  normalizeCollabIncoming,
  normalizeVeicIncoming,
  buildVehiclePreviewDados,
  buildUnifiedTemplate,
  loadLookups,
  summarizeAxis,
  findCollaboratorByDocType,
  findCollaboratorByDocumentAnyNormalized,
  isCollaboratorLinked,
  isVehicleLinked,
  findVehicleByPlateCompany,
  listLinkedCollaborators,
  maybeGenerateAccessIdForLink,
  savePreviewSession,
  getPreviewSession,
  deletePreviewSession,
  validateDocumentByType,
  validateAndNormalizeCollaboratorPayload,
  buildFieldDiffs,
  pickUpdatePatch,
  MAX_ROWS,
};
