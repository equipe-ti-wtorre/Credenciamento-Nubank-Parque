const crypto = require("crypto");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Tabelas com public_id. Usado para injetar o UUID em todo INSERT do Node. */
const PUBLIC_ID_TABLES = new Set([
  "event",
  "event_accreditation",
  "service_access",
  "setores",
  "aprovacoes",
  "company",
  "collaborator",
  "usuarios",
  "perfis",
  "azure_tenants",
  "vehicle",
  "teams_integrations",
  "alertas",
  "product",
  "storage_location",
  "external_company",
  "bracelet_type",
  "collaborator_role",
  "collaborator_block_list",
  "event_day",
  "event_day_company",
  "event_day_company_vehicle",
  "event_day_company_collaborator",
  "setor_contatos",
  "setor_usuarios",
  "setor_usuario_fluxos",
  "event_accreditation_company",
  "event_accreditation_collaborator",
  "event_accreditation_internal",
  "event_accreditation_invite_file",
  "event_accreditation_day",
  "event_accreditation_setor",
  "service_access_collaborator",
  "service_access_vehicle",
  "company_contact",
  "aprovacao_decisoes",
  "material_movement",
  "material_movement_item",
  "company_type",
  "collaborator_document_type",
  "event_day_type",
  "access_status",
  "facial_devices",
]);

/**
 * Campo numérico exposto → tabela.
 * ownRank menor = PK mais específica do próprio objeto.
 * out = nome do public_id quando o campo é FK.
 */
const FIELD_SPECS = [
  ["id_event_day_company_collaborator", "event_day_company_collaborator", "id_event_day_company_collaborator", "event_day_company_collaborator_public_id", 10],
  ["id_event_day_company_vehicle", "event_day_company_vehicle", "id_event_day_company_vehicle", "event_day_company_vehicle_public_id", 11],
  ["id_event_accreditation_collaborator", "event_accreditation_collaborator", "id_event_accreditation_collaborator", "event_accreditation_collaborator_public_id", 12],
  ["id_event_accreditation_invite_file", "event_accreditation_invite_file", "id_event_accreditation_invite_file", "event_accreditation_invite_file_public_id", 13],
  ["id_event_accreditation_company", "event_accreditation_company", "id_event_accreditation_company", "event_accreditation_company_public_id", 14],
  ["id_event_accreditation_day", "event_accreditation_day", "id_event_accreditation_day", "event_accreditation_day_public_id", 15],
  ["id_event_accreditation", "event_accreditation", "id_event_accreditation", "event_accreditation_public_id", 20],
  ["id_service_access_collaborator", "service_access_collaborator", "id_service_access_collaborator", "service_access_collaborator_public_id", 21],
  ["id_service_access_vehicle", "service_access_vehicle", "id_service_access_vehicle", "service_access_vehicle_public_id", 22],
  ["id_service_access", "service_access", "id_service_access", "service_access_public_id", 23],
  ["id_material_movement_item", "material_movement_item", "id_material_movement_item", "material_movement_item_public_id", 24],
  ["id_material_movement", "material_movement", "id_material_movement", "material_movement_public_id", 25],
  ["id_event_day_company", "event_day_company", "id_event_day_company", "event_day_company_public_id", 30],
  ["id_event_day", "event_day", "id_event_day", "event_day_public_id", 31],
  ["id_event", "event", "id_event", "event_public_id", 40],
  ["id_external_company", "external_company", "id_external_company", "external_company_public_id", 41],
  ["id_storage_location", "storage_location", "id_storage_location", "storage_location_public_id", 42],
  ["id_product", "product", "id_product", "product_public_id", 43],
  ["id_vehicle", "vehicle", "id_vehicle", "vehicle_public_id", 44],
  ["id_substitute_vehicle", "vehicle", "id_vehicle", "substitute_vehicle_public_id", 90],
  ["id_collaborator", "collaborator", "id_collaborator", "collaborator_public_id", 45],
  ["id_substitute", "collaborator", "id_collaborator", "substitute_public_id", 91],
  ["id_company_contact", "company_contact", "id_company_contact", "company_contact_public_id", 46],
  ["id_company", "company", "id_company", "company_public_id", 50],
  ["id_company_responsavel", "company", "id_company", "company_responsavel_public_id", 92],
  ["id_company_origem", "company", "id_company", "company_origem_public_id", 93],
  ["id_producer", "company", "id_company", "producer_public_id", 94],
  ["id_bracelet_type", "bracelet_type", "id_bracelet_type", "bracelet_type_public_id", 51],
  ["id_collaborator_role", "collaborator_role", "id_collaborator_role", "collaborator_role_public_id", 52],
  // Catálogos enum (códigos 1..n estáveis). O número permanece: a interface compara o status por esse código.
  ["id_collaborator_document_type", "collaborator_document_type", "id_collaborator_document_type", "collaborator_document_type_public_id", 250],
  ["id_company_type", "company_type", "id_company_type", "company_type_public_id", 250],
  ["id_event_day_type", "event_day_type", "id_event_day_type", "event_day_type_public_id", 250],
  ["id_type", "event_day_type", "id_event_day_type", "event_day_type_public_id", 250],
  ["id_access_status", "access_status", "id_access_status", "access_status_public_id", 250],
  ["sectorId", "setores", "id", "sector_public_id", 70],
  ["idSetor", "setores", "id", "setor_public_id", 81],
  ["id_setor", "setores", "id", "setor_public_id", 60],
  ["id_usuario", "usuarios", "id", "usuario_public_id", 61],
  ["id_solicitante", "usuarios", "id", "solicitante_public_id", 62],
  ["id_perfil", "perfis", "id", "perfil_public_id", 63],
  ["id_aprovacao", "aprovacoes", "id", "aprovacao_public_id", 64],
  ["idEntidade", null, null, "entidade_public_id", 200],
  ["id_entidade", null, null, "entidade_public_id", 200],
];

const FIELD_BY_KEY = new Map(
  FIELD_SPECS.map(([key, table, pk, out, ownRank]) => [key, { key, table, pk, out, ownRank }]),
);

const PLURAL_KEYS = {
  id_collaborators: "id_collaborator",
  id_vehicles: "id_vehicle",
  id_companies: "id_company",
  companies: "id_company",
  id_setores: "id_setor",
  setores: "id_setor",
  id_products: "id_product",
  id_events: "id_event",
  id_bracelet_types: "id_bracelet_type",
  bracelet_types: "id_bracelet_type",
  internal_bracelet_types: "id_bracelet_type",
  usuarios_ids: "id_usuario",
  setores_ids: "id_setor",
};

const TIPO_ENTIDADE = {
  EVENTO: { table: "event", pk: "id_event" },
  ACESSO_SERVICO: { table: "service_access", pk: "id_service_access" },
  CREDENCIAMENTO_EVENTO: {
    table: "event_accreditation_company",
    pk: "id_event_accreditation_company",
  },
  CREDENCIAMENTO_EVENTO_INTERNO: {
    table: "event_accreditation",
    pk: "id_event_accreditation",
  },
};

const PARENT_HINT = {
  setor: { table: "setores", pk: "id" },
  setores: { table: "setores", pk: "id" },
  sectors: { table: "setores", pk: "id" },
  sector: { table: "setores", pk: "id" },
  solicitante: { table: "usuarios", pk: "id" },
  usuario: { table: "usuarios", pk: "id" },
  user: { table: "usuarios", pk: "id" },
  usuarios: { table: "usuarios", pk: "id" },
  users: { table: "usuarios", pk: "id" },
  company: { table: "company", pk: "id_company" },
  empresa: { table: "company", pk: "id_company" },
  companies: { table: "company", pk: "id_company" },
  empresas: { table: "company", pk: "id_company" },
  collaborator: { table: "collaborator", pk: "id_collaborator" },
  colaborador: { table: "collaborator", pk: "id_collaborator" },
  collaborators: { table: "collaborator", pk: "id_collaborator" },
  colaboradores: { table: "collaborator", pk: "id_collaborator" },
  vehicle: { table: "vehicle", pk: "id_vehicle" },
  veiculo: { table: "vehicle", pk: "id_vehicle" },
  vehicles: { table: "vehicle", pk: "id_vehicle" },
  profile: { table: "perfis", pk: "id" },
  perfil: { table: "perfis", pk: "id" },
  profiles: { table: "perfis", pk: "id" },
  perfis: { table: "perfis", pk: "id" },
  tenant: { table: "azure_tenants", pk: "id" },
  tenants: { table: "azure_tenants", pk: "id" },
  alert: { table: "alertas", pk: "id" },
  alerta: { table: "alertas", pk: "id" },
  alerts: { table: "alertas", pk: "id" },
  product: { table: "product", pk: "id_product" },
  products: { table: "product", pk: "id_product" },
  location: { table: "storage_location", pk: "id_storage_location" },
  locations: { table: "storage_location", pk: "id_storage_location" },
  role: { table: "collaborator_role", pk: "id_collaborator_role" },
  roles: { table: "collaborator_role", pk: "id_collaborator_role" },
  contact: { table: "setor_contatos", pk: "id" },
  contato: { table: "setor_contatos", pk: "id" },
  contacts: { table: "setor_contatos", pk: "id" },
  contatos: { table: "setor_contatos", pk: "id" },
  member: { table: "setor_usuarios", pk: "id" },
  membro: { table: "setor_usuarios", pk: "id" },
  members: { table: "setor_usuarios", pk: "id" },
  membros: { table: "setor_usuarios", pk: "id" },
  event: { table: "event", pk: "id_event" },
  evento: { table: "event", pk: "id_event" },
  events: { table: "event", pk: "id_event" },
  service: { table: "service_access", pk: "id_service_access" },
  services: { table: "service_access", pk: "id_service_access" },
  approval: { table: "aprovacoes", pk: "id" },
  aprovacao: { table: "aprovacoes", pk: "id" },
  approvals: { table: "aprovacoes", pk: "id" },
  credential: { table: "event_day_company_collaborator", pk: "id_event_day_company_collaborator" },
  credentials: { table: "event_day_company_collaborator", pk: "id_event_day_company_collaborator" },
  braceletType: { table: "bracelet_type", pk: "id_bracelet_type" },
  braceletTypes: { table: "bracelet_type", pk: "id_bracelet_type" },
  externalCompany: { table: "external_company", pk: "id_external_company" },
  externalCompanies: { table: "external_company", pk: "id_external_company" },
};

function newPublicId() {
  return crypto.randomUUID();
}

function isUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

function formatUuid(value) {
  if (value == null || value === "") return null;
  if (Buffer.isBuffer(value)) {
    if (value.length !== 16) return null;
    const hex = value.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  const text = String(value).trim();
  if (isUuid(text)) return text.toLowerCase();
  return text;
}

function isSafeIdent(name) {
  return /^[a-zA-Z0-9_]+$/.test(String(name || ""));
}

function splitValueTuples(valuesSql) {
  const tuples = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < valuesSql.length; i += 1) {
    const ch = valuesSql[i];
    if (ch === "(") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        tuples.push({ start, end: i });
        start = -1;
      }
    }
  }
  return tuples;
}

/**
 * Acrescenta public_id = crypto.randomUUID() em INSERT de tabela exposta.
 * INSERT ... SELECT fica a cargo do DEFAULT da coluna.
 */
function injectPublicId(sql, values) {
  if (typeof sql !== "string") return { sql, values };
  if (!/^\s*INSERT\s+/i.test(sql)) return { sql, values };
  if (/\bINSERT\s+(?:IGNORE\s+)?INTO\b[\s\S]+?\bSELECT\b/i.test(sql) && !/\bVALUES\b/i.test(sql)) {
    return { sql, values };
  }

  const match = sql.match(
    /^([\s\S]*?\bINSERT\s+(?:IGNORE\s+)?INTO\s+`?)([a-zA-Z0-9_]+)(`?\s*\()([^)]+)(\)\s*VALUES\s*)([\s\S]*)$/i,
  );
  if (!match) return { sql, values };

  const table = match[2];
  if (!PUBLIC_ID_TABLES.has(table)) return { sql, values };
  if (/\bpublic_id\b/i.test(match[4])) return { sql, values };

  let valuesPart = match[6];
  let tail = "";
  const cut = valuesPart.search(/\bON\s+DUPLICATE\b/i);
  if (cut >= 0) {
    tail = valuesPart.slice(cut);
    valuesPart = valuesPart.slice(0, cut);
  }

  const tuples = splitValueTuples(valuesPart);
  if (!tuples.length) return { sql, values };

  let rebuilt = "";
  let cursor = 0;
  const uuids = [];
  for (const tuple of tuples) {
    rebuilt += valuesPart.slice(cursor, tuple.end);
    rebuilt += ", ?";
    rebuilt += valuesPart.slice(tuple.end, tuple.end + 1);
    cursor = tuple.end + 1;
    uuids.push(newPublicId());
  }
  rebuilt += valuesPart.slice(cursor);

  const nextSql = `${match[1]}${table}${match[3]}${match[4]}, public_id${match[5]}${rebuilt}${tail}`;
  if (typeof values === "function") return { sql, values };
  if (values == null) {
    return { sql: nextSql, values: uuids };
  }
  if (Array.isArray(values)) {
    return { sql: nextSql, values: values.concat(uuids) };
  }
  return { sql, values };
}

module.exports = {
  UUID_RE,
  PUBLIC_ID_TABLES,
  FIELD_BY_KEY,
  PLURAL_KEYS,
  TIPO_ENTIDADE,
  PARENT_HINT,
  newPublicId,
  isUuid,
  formatUuid,
  isSafeIdent,
  injectPublicId,
};
