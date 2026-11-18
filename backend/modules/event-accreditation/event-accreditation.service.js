const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const db = require("../../config/db");
const { safePicturePath } = require("../storage/picture-src");
const AppError = require("../../utils/AppError");
const { isUuid } = require("../../utils/publicId");
const companyService = require("../companies/company.service");
const collaboratorService = require("../collaborators/collaborator.service");
const blocklistPolicy = require("../collaborator-blocklist/blocklist.policy");
const approvalsService = require("../approvals/approvals.service");
const {
  STATUS_AGUARDANDO_PRODUTORA,
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_APROVADO,
  STATUS_NEGADO,
  STATUS_EXPIRADO,
} = require("../credentials/credentials.schema");
const notifications = require("./event-accreditation.notifications");
const { attachCoverThumbs, writeCoverThumb, removeCoverThumb } = require("../storage/cover-src");
const {
  buildAccreditationScope,
  hasPermission,
  isAdInternalUser,
  isSuperAdmin,
} = require("../../utils/permissions");
const {
  toDateOnly,
  normalizeEventDates,
  toSaoPauloDate,
  DEFAULT_BRACELET_ICON,
  DEFAULT_BRACELET_COLOR,
} = require("./event-accreditation.schema");

const INDICATION = Object.freeze({
  INDICACAO: "INDICACAO",
  AGUARDANDO_APROVACAO: "AGUARDANDO_APROVACAO",
  APROVADO: "APROVADO",
  NEGADO: "NEGADO",
});

const ENTITY_TYPE = "CREDENCIAMENTO_EVENTO";
const ENTITY_TYPE_INTERNAL = "CREDENCIAMENTO_EVENTO_INTERNO";
const SECTOR_MANAGE_PAPEIS = Object.freeze(["GESTOR", "APROVADOR"]);
const NOTIFY_TIPO = Object.freeze({
  COMPANY_INVITE: "COMPANY_INVITE",
  SECTOR_INDICATION: "SECTOR_INDICATION",
  OWNER_VALIDATED: "OWNER_VALIDATED",
});

function uniquePositiveIds(ids) {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of ids) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function formatDateField(value) {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatDateTimeField(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function parseListQuery(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function parseListFilters(query = {}) {
  const sortRaw = String(query.sort || "").trim().toLowerCase();
  const dirRaw = String(query.dir || "").trim().toLowerCase();
  const situationRaw = String(query.situation || "").trim().toLowerCase();
  return {
    name: query.name ? String(query.name).trim() : "",
    event_kind: query.event_kind ? String(query.event_kind).trim().toUpperCase() : "",
    id_access_status: query.id_access_status ? Number(query.id_access_status) : null,
    situation: ["todos", "abertos", "encerrados"].includes(situationRaw)
      ? situationRaw
      : "todos",
    sort: ["nome", "data", "prazo"].includes(sortRaw) ? sortRaw : "nome",
    dir: dirRaw === "desc" ? "desc" : "asc",
  };
}

function buildListBaseWhere(filters) {
  const where = ["1=1"];
  const params = [];
  if (filters.name) {
    where.push("ea.name LIKE ?");
    params.push(`%${filters.name}%`);
  }
  if (filters.event_kind === "SHOWDAY" || filters.event_kind === "JOGO") {
    where.push("ea.event_kind = ?");
    params.push(filters.event_kind);
  }
  if (Number.isInteger(filters.id_access_status) && filters.id_access_status > 0) {
    where.push("ea.id_access_status = ?");
    params.push(filters.id_access_status);
  }
  return { where, params };
}

function toCount(value) {
  if (value == null) return 0;
  if (typeof value === "bigint") return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const INSCRIPTION_OPEN_SQL = `(IFNULL(ea.ativo, 1) = 1 AND ea.inscription_end IS NOT NULL AND ea.inscription_end >= NOW())`;

function situationPredicate(situation) {
  if (situation === "abertos") return INSCRIPTION_OPEN_SQL;
  if (situation === "encerrados") return `NOT ${INSCRIPTION_OPEN_SQL}`;
  return null;
}

function listSortClause(filters) {
  const col =
    filters.sort === "nome"
      ? "ea.name"
      : filters.sort === "data"
        ? "ea.start"
        : "ea.inscription_end";
  const dir = filters.dir === "desc" ? "DESC" : "ASC";
  return `${col} ${dir}, ea.name ASC`;
}

const COMPANY_TOTAL_SQL = `(SELECT COUNT(*) FROM event_accreditation_company eac
        WHERE eac.id_event_accreditation = ea.id_event_accreditation)`;
const COMPANY_DONE_SQL = `(SELECT COUNT(*) FROM event_accreditation_company eac
        WHERE eac.id_event_accreditation = ea.id_event_accreditation
          AND eac.indication_status <> 'INDICACAO')`;
const PENDING_COUNT_SQL = `(
        (SELECT COUNT(*) FROM event_accreditation_collaborator eacol
          INNER JOIN event_accreditation_company eac
            ON eac.id_event_accreditation_company = eacol.id_event_accreditation_company
         WHERE eac.id_event_accreditation = ea.id_event_accreditation
           AND eacol.id_access_status IN (${STATUS_AGUARDANDO_PRODUTORA}, ${STATUS_AGUARDANDO_APROVACAO}))
        +
        (SELECT COUNT(*) FROM event_accreditation_internal eai
         WHERE eai.id_event_accreditation = ea.id_event_accreditation
           AND eai.id_access_status IN (${STATUS_AGUARDANDO_PRODUTORA}, ${STATUS_AGUARDANDO_APROVACAO}))
      )`;

function isInscriptionOpen(row, now = new Date()) {
  const start = row.inscription_start instanceof Date
    ? row.inscription_start
    : new Date(row.inscription_start);
  const end = row.inscription_end instanceof Date
    ? row.inscription_end
    : new Date(row.inscription_end);
  return now >= start && now <= end;
}

function assertActive(row) {
  if (row && row.ativo != null && !Number(row.ativo)) {
    throw new AppError("Credenciamento desativado. Reative-o para continuar.", 403);
  }
}

function braceletMatchesKind(braceletKind, eventKind) {
  return braceletKind === "BOTH" || braceletKind === eventKind;
}

function mapBraceletRow(r) {
  return {
    id_bracelet_type: r.id_bracelet_type,
    name: r.name,
    event_kind: r.event_kind,
    icon: r.icon || DEFAULT_BRACELET_ICON,
    color: r.color || DEFAULT_BRACELET_COLOR,
    ativo: !!Number(r.ativo),
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em,
  };
}

async function listBraceletsOf(id, conn = db) {
  const [rows] = await conn.execute(
    `SELECT bt.*
       FROM event_accreditation_bracelet eab
       INNER JOIN bracelet_type bt ON bt.id_bracelet_type = eab.id_bracelet_type
      WHERE eab.id_event_accreditation = ?
      ORDER BY bt.name ASC`,
    [id],
  );
  return rows.map(mapBraceletRow);
}

async function listInternalBraceletsOf(id, conn = db) {
  const [rows] = await conn.execute(
    `SELECT bt.*
       FROM event_accreditation_internal_bracelet eaib
       INNER JOIN bracelet_type bt ON bt.id_bracelet_type = eaib.id_bracelet_type
      WHERE eaib.id_event_accreditation = ?
      ORDER BY bt.name ASC`,
    [id],
  );
  return rows.map(mapBraceletRow);
}

async function resolveBraceletIds(ids, eventKind, conn = db) {
  const braceletIds = uniquePositiveIds(ids);
  if (!braceletIds.length) {
    throw new AppError("Selecione ao menos um tipo de pulseira.", 400);
  }
  const placeholders = braceletIds.map(() => "?").join(",");
  const [rows] = await conn.execute(
    `SELECT * FROM bracelet_type
      WHERE id_bracelet_type IN (${placeholders}) AND ativo = 1`,
    braceletIds,
  );
  if (rows.length !== braceletIds.length) {
    throw new AppError("Um ou mais tipos de pulseira são inválidos ou estão inativos.", 400);
  }
  for (const row of rows) {
    if (!braceletMatchesKind(row.event_kind, eventKind)) {
      throw new AppError("Tipo de pulseira não permitido para este tipo de evento.", 400);
    }
  }
  return braceletIds;
}

async function findById(id, conn = db) {
  const [rows] = await conn.execute(
    `SELECT ea.*,
            ast.description AS access_status_description,
            s.nome AS setor_nome,
            rc.company_name AS responsavel_company_name,
            rc.fancy_name AS responsavel_fancy_name
       FROM event_accreditation ea
       LEFT JOIN access_status ast ON ast.id_access_status = ea.id_access_status
       LEFT JOIN setores s ON s.id = ea.id_setor
       LEFT JOIN company rc ON rc.id_company = ea.id_company_responsavel
      WHERE ea.id_event_accreditation = ?
      LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

function mapItemRow(row) {
  return {
    id_event_accreditation: row.id_event_accreditation,
    name: row.name,
    event_kind: row.event_kind,
    start: formatDateField(row.start),
    end: formatDateField(row.end),
    inscription_start: formatDateTimeField(row.inscription_start),
    inscription_end: formatDateTimeField(row.inscription_end),
    inscription_open: isInscriptionOpen(row),
    id_access_status: row.id_access_status != null ? Number(row.id_access_status) : null,
    access_status_description: row.access_status_description || null,
    id_setor: row.id_setor != null ? Number(row.id_setor) : null,
    setor_nome: row.setor_nome || null,
    setores: Array.isArray(row.setores) ? row.setores : undefined,
    id_solicitante: row.id_solicitante != null ? Number(row.id_solicitante) : null,
    id_company_responsavel:
      row.id_company_responsavel != null ? Number(row.id_company_responsavel) : null,
    company_responsavel: row.responsavel_company_name
      ? {
          id_company: Number(row.id_company_responsavel),
          company_name: row.responsavel_company_name,
          fancy_name: row.responsavel_fancy_name || null,
        }
      : null,
    ativo: row.ativo == null ? true : !!Number(row.ativo),
    internal_enabled: !!Number(row.internal_enabled),
    photo_required: !!Number(row.photo_required),
    cover: row.cover || null,
    cover_url: row.cover
      ? `/storage/event-accreditation-covers?filename=${encodeURIComponent(path.basename(row.cover))}`
      : null,
    companies_total: row.companies_total != null ? Number(row.companies_total) : undefined,
    companies_completed: row.companies_completed != null ? Number(row.companies_completed) : undefined,
    pending_count: row.pending_count != null ? Number(row.pending_count) : undefined,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    event_dates: Array.isArray(row.event_dates) ? row.event_dates : undefined,
  };
}

async function listEventDates(idAccreditation, conn = db) {
  const [rows] = await conn.execute(
    `SELECT day FROM event_accreditation_day
      WHERE id_event_accreditation = ?
      ORDER BY day ASC`,
    [idAccreditation],
  );
  return rows.map((r) => formatDateField(r.day)).filter(Boolean);
}

async function replaceEventDates(conn, idAccreditation, dates) {
  const unique = normalizeEventDates(dates);
  if (!unique.length) {
    throw new AppError("Selecione ao menos um dia do evento.", 400);
  }
  await conn.execute(`DELETE FROM event_accreditation_day WHERE id_event_accreditation = ?`, [
    idAccreditation,
  ]);
  for (const day of unique) {
    await conn.execute(
      `INSERT INTO event_accreditation_day (id_event_accreditation, day) VALUES (?, ?)`,
      [idAccreditation, day],
    );
  }
  return unique;
}

async function attachEventDates(items) {
  if (!items.length) return items;
  const ids = items.map((i) => i.id_event_accreditation);
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await db.execute(
    `SELECT id_event_accreditation, day
       FROM event_accreditation_day
      WHERE id_event_accreditation IN (${placeholders})
      ORDER BY day ASC`,
    ids,
  );
  const map = new Map();
  for (const row of rows) {
    const id = Number(row.id_event_accreditation);
    const list = map.get(id) || [];
    list.push(formatDateField(row.day));
    map.set(id, list);
  }
  return items.map((item) => {
    const dates = map.get(item.id_event_accreditation);
    return {
      ...item,
      event_dates: dates?.length ? dates : [item.start].filter(Boolean),
    };
  });
}

function buildScopeWhere(scope, alias = "ea") {
  if (scope.mode === "admin") return { sql: "", params: [] };
  if (scope.mode === "company") {
    return {
      sql: ` AND (
        ${alias}.id_company_responsavel = ?
        OR EXISTS (
          SELECT 1 FROM event_accreditation_company eac_scope
           WHERE eac_scope.id_event_accreditation = ${alias}.id_event_accreditation
             AND eac_scope.id_company = ?
        )
      )`,
      params: [scope.companyId, scope.companyId],
    };
  }
  if (scope.mode === "sector_approver") {
    const sectorExists = `EXISTS (
        SELECT 1 FROM event_accreditation_setor eas_scope
         INNER JOIN setor_usuarios su
           ON su.id_setor = eas_scope.id_setor
          AND su.id_usuario = ?
          AND su.ativo = 1
        WHERE eas_scope.id_event_accreditation = ${alias}.id_event_accreditation
      )`;
    if (scope.includeInternal) {
      return {
        sql: ` AND (${sectorExists} OR ${alias}.internal_enabled = 1)`,
        params: [scope.userId],
      };
    }
    return {
      sql: ` AND ${sectorExists}`,
      params: [scope.userId],
    };
  }
  if (scope.mode === "internal") {
    return {
      sql: ` AND ${alias}.internal_enabled = 1`,
      params: [],
    };
  }
  return { sql: " AND 1=0", params: [] };
}

async function assertCanRead(req, row) {
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  const scope = buildAccreditationScope(req.user);
  if (scope.mode === "admin") return;
  if (scope.mode === "company") {
    if (Number(row.id_company_responsavel) === scope.companyId) return;
    const [links] = await db.execute(
      `SELECT 1 FROM event_accreditation_company
        WHERE id_event_accreditation = ? AND id_company = ?
        LIMIT 1`,
      [row.id_event_accreditation, scope.companyId],
    );
    if (links.length) return;
    throw new AppError("Sem permissão para ver este credenciamento.", 403);
  }
  if (scope.mode === "sector_approver") {
    const memberships = await listUserSectorsOnAccreditation(
      scope.userId,
      row.id_event_accreditation,
    );
    if (memberships.length) return;
    if (scope.includeInternal && Number(row.internal_enabled)) return;
  }
  if (scope.mode === "internal" && Number(row.internal_enabled)) return;
  throw new AppError("Sem permissão para ver este credenciamento.", 403);
}

function canManageItem(req, row) {
  if (isSuperAdmin(req.user)) return true;
  if (req.user?.id && Number(row.id_solicitante) === Number(req.user.id)) return true;
  const userCompany =
    req.user?.id_company != null ? Number(req.user.id_company) : null;
  if (userCompany && Number(row.id_company_responsavel) === userCompany) return true;
  return false;
}

function seesAllCompanies(req, item) {
  return isSuperAdmin(req.user) || canManageItem(req, item);
}

function canDecideInternal(req, item) {
  return seesAllCompanies(req, item);
}

function canDeleteItem(req, row) {
  if (isSuperAdmin(req.user)) return true;
  const canAct =
    hasPermission(req.user, "event_accreditation", "delete") ||
    hasPermission(req.user, "event_accreditation", "edit");
  if (!canAct) return false;
  return canManageItem(req, row);
}

function companySectorId(link, item) {
  return Number(link?.id_setor || item?.id_setor);
}

async function listSectorsOf(idAccreditation, conn = db) {
  const [rows] = await conn.execute(
    `SELECT eas.id_setor, s.nome
       FROM event_accreditation_setor eas
       INNER JOIN setores s ON s.id = eas.id_setor
      WHERE eas.id_event_accreditation = ?
      ORDER BY s.nome ASC`,
    [idAccreditation],
  );
  return rows.map((r) => ({
    id_setor: Number(r.id_setor),
    nome: r.nome,
  }));
}

async function attachSectors(items) {
  if (!items.length) return items;
  const ids = items.map((i) => i.id_event_accreditation);
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await db.execute(
    `SELECT eas.id_event_accreditation, eas.id_setor, s.nome
       FROM event_accreditation_setor eas
       INNER JOIN setores s ON s.id = eas.id_setor
      WHERE eas.id_event_accreditation IN (${placeholders})
      ORDER BY s.nome ASC`,
    ids,
  );
  const map = new Map();
  for (const row of rows) {
    const id = Number(row.id_event_accreditation);
    const list = map.get(id) || [];
    list.push({ id_setor: Number(row.id_setor), nome: row.nome });
    map.set(id, list);
  }
  return items.map((item) => {
    const setores = map.get(item.id_event_accreditation);
    return {
      ...item,
      setores: setores?.length
        ? setores
        : item.id_setor
          ? [{ id_setor: item.id_setor, nome: item.setor_nome }]
          : [],
    };
  });
}

async function listUserSectorsOnAccreditation(userId, accreditationId, conn = db) {
  if (!userId || !accreditationId) return [];
  const [rows] = await conn.execute(
    `SELECT eas.id_setor, su.papel, s.nome
       FROM event_accreditation_setor eas
       INNER JOIN setor_usuarios su
         ON su.id_setor = eas.id_setor AND su.id_usuario = ? AND su.ativo = 1
       INNER JOIN setores s ON s.id = eas.id_setor
      WHERE eas.id_event_accreditation = ?`,
    [userId, accreditationId],
  );
  return rows.map((r) => ({
    id_setor: Number(r.id_setor),
    papel: r.papel,
    nome: r.nome,
  }));
}

async function assertActiveSectors(ids, conn = db) {
  const unique = uniquePositiveIds(ids);
  if (!unique.length) {
    throw new AppError("Selecione ao menos um setor participante.", 400);
  }
  const placeholders = unique.map(() => "?").join(",");
  const [rows] = await conn.execute(
    `SELECT id FROM setores WHERE id IN (${placeholders}) AND ativo = 1`,
    unique,
  );
  if (rows.length !== unique.length) {
    throw new AppError("Um ou mais setores são inválidos ou estão inativos.", 400);
  }
  return unique;
}

async function replaceSectors(conn, accreditationId, sectorIds) {
  await conn.execute(
    `DELETE FROM event_accreditation_setor WHERE id_event_accreditation = ?`,
    [accreditationId],
  );
  for (const idSetor of sectorIds) {
    await conn.execute(
      `INSERT INTO event_accreditation_setor (id_event_accreditation, id_setor) VALUES (?, ?)`,
      [accreditationId, idSetor],
    );
  }
}

async function assertSectorParticipates(accreditationId, idSetor, conn = db) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM event_accreditation_setor
      WHERE id_event_accreditation = ? AND id_setor = ?
      LIMIT 1`,
    [accreditationId, idSetor],
  );
  if (!rows.length) {
    throw new AppError("Este setor não participa deste credenciamento.", 404);
  }
}

async function canManageSectorCompanies(req, row, idSetor) {
  if (isSuperAdmin(req.user)) return true;
  if (canManageItem(req, row)) return true;
  const memberships = await listUserSectorsOnAccreditation(
    req.user?.id,
    row.id_event_accreditation,
  );
  const m = memberships.find((x) => x.id_setor === Number(idSetor));
  return !!m && SECTOR_MANAGE_PAPEIS.includes(m.papel);
}

async function canDecideForSector(req, row, idSetor) {
  if (isSuperAdmin(req.user)) return true;
  if (canManageItem(req, row) && hasPermission(req.user, "event_accreditation", "edit")) {
    return true;
  }
  return userIsSectorApprover(idSetor, req.user?.id);
}

async function logNotify({
  idAccreditation,
  idCompanyLink = null,
  idSetor = null,
  tipo,
  userId = null,
  conn = db,
}) {
  await conn.execute(
    `INSERT INTO event_accreditation_notify_log
       (id_event_accreditation, id_event_accreditation_company, id_setor, tipo, id_usuario)
     VALUES (?, ?, ?, ?, ?)`,
    [idAccreditation, idCompanyLink, idSetor, tipo, userId],
  );
}

async function listCreateSectors(_req) {
  await approvalsService.ensureActiveFlowsForTipo(ENTITY_TYPE);
  const sectorsService = require("../sectors/sectors.service");
  return sectorsService.listSectorsSelect();
}

function canIndicateForCompany(req, row, idCompany) {
  const userCompany =
    req.user?.id_company != null ? Number(req.user.id_company) : null;
  return userCompany != null && userCompany === Number(idCompany);
}

function canAddCollaboratorsForCompany(req, row, idCompany) {
  if (canIndicateForCompany(req, row, idCompany)) return true;
  if (canManageItem(req, row) && hasPermission(req.user, "event_accreditation", "edit")) return true;
  return false;
}

function isPendingStatus(status) {
  const st = Number(status);
  return st === STATUS_AGUARDANDO_PRODUTORA || st === STATUS_AGUARDANDO_APROVACAO;
}

function isBlockedStatus(status) {
  const st = Number(status);
  return st === STATUS_NEGADO || st === STATUS_EXPIRADO;
}

function hasCollaboratorPicture(picture) {
  return !!(picture && String(picture).trim());
}

function countsTowardPhotoGate(status) {
  const st = Number(status);
  return isPendingStatus(st) || st === STATUS_APROVADO;
}

function isPhotoRequiredActive(row) {
  return !!Number(row?.photo_required);
}

function countMissingPhotosFromList(collaborators) {
  return (collaborators || []).filter(
    (c) =>
      countsTowardPhotoGate(c.id_access_status) && !hasCollaboratorPicture(c.collaborator_picture),
  ).length;
}

function missingPhotoNotifyMessage(count) {
  const n = Number(count) || 0;
  if (n <= 1) {
    return "1 colaborador sem foto. O responsável só pode ser avisado quando todos tiverem foto.";
  }
  return `${n} colaboradores sem foto. O responsável só pode ser avisado quando todos tiverem foto.`;
}

function missingPhotoSectorMessage(count) {
  const n = Number(count) || 0;
  if (n <= 1) {
    return "1 colaborador sem foto. O setor só pode ser avisado quando todos tiverem foto.";
  }
  return `${n} colaboradores sem foto. O setor só pode ser avisado quando todos tiverem foto.`;
}

async function assertPhotosReadyForNotify(row, linkId, conn = db) {
  if (!isPhotoRequiredActive(row)) return 0;
  const missing = await countMissingPhotos(linkId, conn);
  if (missing > 0) {
    throw new AppError(missingPhotoSectorMessage(missing), 409);
  }
  return missing;
}

async function countMissingPhotos(idCompanyLink, conn = db) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS total
       FROM event_accreditation_collaborator eacol
       INNER JOIN collaborator c ON c.id_collaborator = eacol.id_collaborator
      WHERE eacol.id_event_accreditation_company = ?
        AND eacol.id_access_status IN (?, ?, ?)
        AND (c.picture IS NULL OR TRIM(c.picture) = '')`,
    [idCompanyLink, STATUS_AGUARDANDO_PRODUTORA, STATUS_AGUARDANDO_APROVACAO, STATUS_APROVADO],
  );
  return Number(rows[0]?.total || 0);
}

async function countCompanyStatuses(linkId, conn = db) {
  const [rows] = await conn.execute(
    `SELECT id_access_status, COUNT(*) AS total
       FROM event_accreditation_collaborator
      WHERE id_event_accreditation_company = ?
      GROUP BY id_access_status`,
    [linkId],
  );
  const counts = { pending: 0, approved: 0, blocked: 0, total: 0 };
  for (const row of rows) {
    const n = Number(row.total || 0);
    counts.total += n;
    if (isPendingStatus(row.id_access_status)) counts.pending += n;
    else if (Number(row.id_access_status) === STATUS_APROVADO) counts.approved += n;
    else if (isBlockedStatus(row.id_access_status)) counts.blocked += n;
  }
  return counts;
}

async function userIsSectorApprover(idSetor, userId) {
  if (!idSetor || !userId) return false;
  const approvers = await approvalsService.listEligibleApprovers(idSetor, 1, {
    tipoEntidade: "CREDENCIAMENTO_EVENTO",
  });
  return approvers.some((a) => Number(a.id) === Number(userId));
}

async function canDecideItem(req, row) {
  if (isSuperAdmin(req.user)) return true;
  if (canManageItem(req, row) && hasPermission(req.user, "event_accreditation", "edit")) {
    return true;
  }
  const memberships = await listUserSectorsOnAccreditation(
    req.user?.id,
    row.id_event_accreditation,
  );
  for (const m of memberships) {
    if (await userIsSectorApprover(m.id_setor, req.user?.id)) return true;
  }
  return userIsSectorApprover(row.id_setor, req.user?.id);
}

function formatDecisionReason(reason, note) {
  const motivo = String(reason || "").trim();
  const obs = String(note || "").trim();
  if (!motivo) return null;
  const text = obs ? `${motivo} — ${obs}` : motivo;
  return text.slice(0, 240);
}

function buildKpis(companies, internals = []) {
  const kpis = {
    companies_total: companies.length,
    companies_pending: 0,
    companies_waiting: 0,
    companies_approved: 0,
    companies_denied: 0,
    collaborators_total: 0,
    collaborators_waiting: 0,
    collaborators_approved: 0,
    collaborators_denied: 0,
    internals_total: internals.length,
    internals_waiting: 0,
    internals_approved: 0,
    internals_denied: 0,
  };
  for (const row of internals) {
    const st = Number(row.id_access_status);
    if (st === STATUS_APROVADO) kpis.internals_approved += 1;
    else if (isBlockedStatus(st)) kpis.internals_denied += 1;
    else kpis.internals_waiting += 1;
  }
  for (const company of companies) {
    if (company.indication_status === INDICATION.INDICACAO) kpis.companies_pending += 1;
    else if (company.indication_status === INDICATION.AGUARDANDO_APROVACAO) kpis.companies_waiting += 1;
    else if (company.indication_status === INDICATION.APROVADO) kpis.companies_approved += 1;
    else if (company.indication_status === INDICATION.NEGADO) kpis.companies_denied += 1;
    for (const col of company.collaborators || []) {
      kpis.collaborators_total += 1;
      const st = Number(col.id_access_status);
      if (st === STATUS_APROVADO) kpis.collaborators_approved += 1;
      else if (st === STATUS_NEGADO) kpis.collaborators_denied += 1;
      else kpis.collaborators_waiting += 1;
    }
  }
  return kpis;
}

async function listCompaniesOf(id, partnerOnlyCompanyId = null) {
  const params = [id];
  let extra = "";
  if (partnerOnlyCompanyId) {
    extra = " AND eac.id_company = ?";
    params.push(partnerOnlyCompanyId);
  }
  const [rows] = await db.execute(
    `SELECT eac.*, c.company_name, c.fancy_name, c.logo,
            s.nome AS setor_nome,
            a.id AS id_aprovacao, a.status AS aprovacao_status
       FROM event_accreditation_company eac
       INNER JOIN company c ON c.id_company = eac.id_company
       LEFT JOIN setores s ON s.id = eac.id_setor
       LEFT JOIN aprovacoes a
         ON a.tipo_entidade = ?
        AND a.id_entidade = eac.id_event_accreditation_company
        AND a.status = 'PENDENTE'
      WHERE eac.id_event_accreditation = ?${extra}
      ORDER BY s.nome ASC, c.company_name ASC`,
    [ENTITY_TYPE, ...params],
  );
  return rows;
}

async function listCollaboratorsOfCompany(idCompanyLink) {
  const [rows] = await db.execute(
    `SELECT eacol.*,
            c.name AS collaborator_name, c.document AS collaborator_document,
            c.picture AS collaborator_picture,
            cr.description AS role_description,
            bt.name AS bracelet_name, bt.event_kind AS bracelet_kind,
            bt.icon AS bracelet_icon, bt.color AS bracelet_color,
            ast.description AS access_status_description,
            u.username AS decided_by_name
       FROM event_accreditation_collaborator eacol
       INNER JOIN collaborator c ON c.id_collaborator = eacol.id_collaborator
       INNER JOIN collaborator_role cr ON cr.id_collaborator_role = eacol.id_collaborator_role
       INNER JOIN bracelet_type bt ON bt.id_bracelet_type = eacol.id_bracelet_type
       INNER JOIN access_status ast ON ast.id_access_status = eacol.id_access_status
       LEFT JOIN usuarios u ON u.id = eacol.decided_by
      WHERE eacol.id_event_accreditation_company = ?
      ORDER BY c.name ASC`,
    [idCompanyLink],
  );
  return rows.map(mapCollaboratorRow);
}

async function listInternalRegistrations(idAccreditation) {
  const [rows] = await db.execute(
    `SELECT eai.*,
            u.nome_completo, u.email, u.departamento,
            bt.name AS bracelet_name, bt.event_kind AS bracelet_kind,
            bt.icon AS bracelet_icon, bt.color AS bracelet_color,
            ast.description AS access_status_description,
            du.nome_completo AS decided_by_name
       FROM event_accreditation_internal eai
       INNER JOIN usuarios u ON u.id = eai.id_usuario
       INNER JOIN bracelet_type bt ON bt.id_bracelet_type = eai.id_bracelet_type
       INNER JOIN access_status ast ON ast.id_access_status = eai.id_access_status
       LEFT JOIN usuarios du ON du.id = eai.decided_by
      WHERE eai.id_event_accreditation = ?
      ORDER BY u.nome_completo ASC`,
    [idAccreditation],
  );
  return rows.map(mapInternalRow);
}

function mapInternalRow(r) {
  return {
    id_event_accreditation_internal: Number(r.id_event_accreditation_internal),
    id_event_accreditation: Number(r.id_event_accreditation),
    id_usuario: Number(r.id_usuario),
    nome_completo: r.nome_completo,
    email: r.email,
    departamento: r.departamento || null,
    id_bracelet_type: Number(r.id_bracelet_type),
    bracelet_name: r.bracelet_name,
    bracelet_kind: r.bracelet_kind,
    bracelet_icon: r.bracelet_icon || DEFAULT_BRACELET_ICON,
    bracelet_color: r.bracelet_color || DEFAULT_BRACELET_COLOR,
    id_access_status: Number(r.id_access_status),
    access_status_description: r.access_status_description || null,
    criado_em: r.criado_em,
    decided_by: r.decided_by != null ? Number(r.decided_by) : null,
    decided_by_name: r.decided_by_name || null,
    decided_at: formatDateTimeField(r.decided_at),
    decision_reason: r.decision_reason || null,
  };
}

function mapCollaboratorRow(r) {
  return {
    id_event_accreditation_collaborator: r.id_event_accreditation_collaborator,
    id_event_accreditation_company: r.id_event_accreditation_company,
    id_collaborator: r.id_collaborator,
    id_collaborator_role: r.id_collaborator_role,
    id_bracelet_type: r.id_bracelet_type,
    id_access_status: Number(r.id_access_status),
    access_status_description: r.access_status_description || null,
    collaborator_name: r.collaborator_name,
    collaborator_document: r.collaborator_document,
    collaborator_picture: r.collaborator_picture || null,
    role_description: r.role_description,
    bracelet_name: r.bracelet_name,
    bracelet_kind: r.bracelet_kind,
    bracelet_icon: r.bracelet_icon || DEFAULT_BRACELET_ICON,
    bracelet_color: r.bracelet_color || DEFAULT_BRACELET_COLOR,
    criado_em: r.criado_em,
    decided_by: r.decided_by != null ? Number(r.decided_by) : null,
    decided_by_name: r.decided_by_name || null,
    decided_at: formatDateTimeField(r.decided_at),
    decision_reason: r.decision_reason || null,
  };
}

function partnerOnlyCompanyId(req, row) {
  if (isSuperAdmin(req.user)) return null;
  if (canManageItem(req, row)) return null;
  if (hasPermission(req.user, "approvals", "view") && !req.user?.requires_company) {
    return null;
  }
  const idCompany =
    req.user?.id_company != null ? Number(req.user.id_company) : null;
  return idCompany || null;
}

async function countCollaborators(idCompanyLink, conn = db) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS total
       FROM event_accreditation_collaborator
      WHERE id_event_accreditation_company = ?`,
    [idCompanyLink],
  );
  return Number(rows[0]?.total || 0);
}

async function syncParentStatus(id, conn = db) {
  const [companies] = await conn.execute(
    `SELECT indication_status FROM event_accreditation_company
      WHERE id_event_accreditation = ?`,
    [id],
  );
  const [itemRows] = await conn.execute(
    `SELECT internal_enabled FROM event_accreditation WHERE id_event_accreditation = ? LIMIT 1`,
    [id],
  );
  const internalEnabled = !!Number(itemRows[0]?.internal_enabled);
  const [internalRows] = internalEnabled
    ? await conn.execute(
        `SELECT id_access_status FROM event_accreditation_internal
          WHERE id_event_accreditation = ?`,
        [id],
      )
    : [[]];
  if (!companies.length && !internalRows.length) return;
  const allCompaniesTerminal =
    companies.length > 0 &&
    companies.every(
      (c) => c.indication_status === INDICATION.APROVADO || c.indication_status === INDICATION.NEGADO,
    );
  const anyCompanyWaiting = companies.some(
    (c) => c.indication_status === INDICATION.AGUARDANDO_APROVACAO,
  );
  const anyCompanyApproved = companies.some((c) => c.indication_status === INDICATION.APROVADO);
  const anyInternalWaiting = internalRows.some((r) => isPendingStatus(r.id_access_status));
  const anyInternalApproved = internalRows.some(
    (r) => Number(r.id_access_status) === STATUS_APROVADO,
  );
  const allInternalsTerminal =
    !internalEnabled ||
    internalRows.length === 0 ||
    internalRows.every((r) => !isPendingStatus(r.id_access_status));
  let next = STATUS_AGUARDANDO_PRODUTORA;
  if ((companies.length === 0 || allCompaniesTerminal) && allInternalsTerminal) {
    next = anyCompanyApproved || anyInternalApproved ? STATUS_APROVADO : STATUS_NEGADO;
  } else if (anyCompanyWaiting || anyInternalWaiting) {
    next = STATUS_AGUARDANDO_APROVACAO;
  }
  await conn.execute(
    `UPDATE event_accreditation SET id_access_status = ? WHERE id_event_accreditation = ?`,
    [next, id],
  );
}

async function completeCompanyIndicationInternal(conn, link, item, { auto = false } = {}) {
  if (link.indication_status !== INDICATION.INDICACAO) return null;
  const total = await countCollaborators(link.id_event_accreditation_company, conn);
  if (total === 0) {
    await conn.execute(
      `UPDATE event_accreditation_company
          SET indication_status = ?, indicated_complete_at = NOW()
        WHERE id_event_accreditation_company = ?`,
      [INDICATION.NEGADO, link.id_event_accreditation_company],
    );
    await syncParentStatus(item.id_event_accreditation, conn);
    return { approval: null, empty: true, auto };
  }

  await conn.execute(
    `UPDATE event_accreditation_collaborator
        SET id_access_status = ?
      WHERE id_event_accreditation_company = ?
        AND id_access_status = ?`,
    [STATUS_AGUARDANDO_APROVACAO, link.id_event_accreditation_company, STATUS_AGUARDANDO_PRODUTORA],
  );

  const counts = await countCompanyStatuses(link.id_event_accreditation_company, conn);
  if (counts.pending === 0) {
    const companyStatus = counts.approved > 0 ? INDICATION.APROVADO : INDICATION.NEGADO;
    await conn.execute(
      `UPDATE event_accreditation_company
          SET indication_status = ?, indicated_complete_at = NOW()
        WHERE id_event_accreditation_company = ?`,
      [companyStatus, link.id_event_accreditation_company],
    );
    await syncParentStatus(item.id_event_accreditation, conn);
    return { approval: null, empty: false, auto };
  }

  const [pending] = await conn.execute(
    `SELECT id FROM aprovacoes
      WHERE tipo_entidade = ? AND id_entidade = ? AND status = 'PENDENTE'
      LIMIT 1`,
    [ENTITY_TYPE, link.id_event_accreditation_company],
  );
  let approval = null;
  if (!pending.length) {
    await approvalsService.ensureActiveFlowsForTipo(ENTITY_TYPE);
    approval = await approvalsService.createApprovalFor(conn, {
      tipoEntidade: ENTITY_TYPE,
      idEntidade: link.id_event_accreditation_company,
      idSetor: companySectorId(link, item),
      idSolicitante: item.id_solicitante,
    });
  }

  await conn.execute(
    `UPDATE event_accreditation_company
        SET indication_status = ?, indicated_complete_at = NOW()
      WHERE id_event_accreditation_company = ?`,
    [INDICATION.AGUARDANDO_APROVACAO, link.id_event_accreditation_company],
  );
  await syncParentStatus(item.id_event_accreditation, conn);
  return { approval, empty: false, auto };
}

async function closeOverdueIndications(item) {
  if (isInscriptionOpen(item)) return [];
  const [links] = await db.execute(
    `SELECT * FROM event_accreditation_company
      WHERE id_event_accreditation = ? AND indication_status = ?`,
    [item.id_event_accreditation, INDICATION.INDICACAO],
  );
  if (!links.length) return [];

  const created = [];
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const link of links) {
      if (isPhotoRequiredActive(item)) {
        const missing = await countMissingPhotos(link.id_event_accreditation_company, conn);
        if (missing > 0) continue;
      }
      const result = await completeCompanyIndicationInternal(conn, link, item, { auto: true });
      if (result?.approval) created.push(result.approval);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return created;
}

async function hydrateDetail(req, row) {
  const createdApprovals = await closeOverdueIndications(row);
  for (const approval of createdApprovals) {
    if (approval?.id) {
      try {
        const { notifyApprovalCreated } = require("../approvals/approvals.notifications");
        notifyApprovalCreated({
          idAprovacao: approval.id,
          idSetor: approval.id_setor || row.id_setor,
          idSolicitante: row.id_solicitante,
        }).catch(() => {});
      } catch {
        /* notificação opcional */
      }
    }
  }
  const fresh = await findById(row.id_event_accreditation);
  const onlyCompany = partnerOnlyCompanyId(req, fresh);
  let companyRows = await listCompaniesOf(fresh.id_event_accreditation, onlyCompany);
  const memberships = await listUserSectorsOnAccreditation(
    req.user?.id,
    fresh.id_event_accreditation,
  );
  const scope = buildAccreditationScope(req.user);
  const seesAll = seesAllCompanies(req, fresh);
  if (!seesAll && scope.mode !== "company") {
    const allowed = new Set(memberships.map((m) => m.id_setor));
    companyRows = companyRows.filter((c) => allowed.has(Number(c.id_setor || fresh.id_setor)));
  }
  const companies = [];
  for (const c of companyRows) {
    const idSetor = Number(c.id_setor || fresh.id_setor);
    const canDecideCompany = await canDecideForSector(req, fresh, idSetor);
    const collaborators = await listCollaboratorsOfCompany(c.id_event_accreditation_company);
    const missingPhotoCount = isPhotoRequiredActive(fresh)
      ? countMissingPhotosFromList(collaborators)
      : 0;
    companies.push({
      id_event_accreditation_company: c.id_event_accreditation_company,
      id_company: Number(c.id_company),
      id_setor: idSetor,
      setor_nome: c.setor_nome || null,
      company_name: c.company_name,
      fancy_name: c.fancy_name || null,
      logo: c.logo || null,
      indication_status: c.indication_status,
      indicated_complete_at: formatDateTimeField(c.indicated_complete_at),
      id_aprovacao: c.id_aprovacao != null ? Number(c.id_aprovacao) : null,
      aprovacao_status: c.aprovacao_status || null,
      can_indicate:
        isInscriptionOpen(fresh) &&
        !!Number(fresh.ativo) &&
        canAddCollaboratorsForCompany(req, fresh, c.id_company),
      can_complete:
        c.indication_status === INDICATION.INDICACAO &&
        isInscriptionOpen(fresh) &&
        !!Number(fresh.ativo) &&
        canIndicateForCompany(req, fresh, c.id_company),
      can_notify_sector:
        canIndicateForCompany(req, fresh, c.id_company) &&
        c.indication_status !== INDICATION.INDICACAO,
      can_notify_owner:
        canDecideCompany &&
        (c.indication_status === INDICATION.APROVADO ||
          c.indication_status === INDICATION.NEGADO) &&
        missingPhotoCount === 0,
      missing_photo_count: missingPhotoCount,
      can_decide: canDecideCompany,
      can_remove:
        c.indication_status === INDICATION.INDICACAO &&
        (await canManageSectorCompanies(req, fresh, idSetor)),
      collaborators,
    });
  }

  const allTerminal =
    companyRows.length > 0 &&
    companyRows.every(
      (c) =>
        c.indication_status === INDICATION.APROVADO ||
        c.indication_status === INDICATION.NEGADO,
    );

  const canManage =
    canManageItem(req, fresh) && hasPermission(req.user, "event_accreditation", "edit");
  const canDecide = await canDecideItem(req, fresh);
  const decideInternal = canDecideInternal(req, fresh);
  const hideCompanies = scope.mode === "internal";
  const visibleCompanies = hideCompanies ? [] : companies;
  const internalEnabled = !!Number(fresh.internal_enabled);
  const internals = internalEnabled
    ? await listInternalRegistrations(fresh.id_event_accreditation)
    : [];
  const myInternals = internals.filter((r) => Number(r.id_usuario) === Number(req.user?.id));
  const myInternal = myInternals[0] || null;
  const canRegisterInternal =
    internalEnabled &&
    isAdInternalUser(req.user) &&
    isInscriptionOpen(fresh) &&
    !!Number(fresh.ativo) &&
    myInternals.length === 0;
  const visibleInternals = decideInternal ? internals : myInternals;
  const internalsPending = visibleInternals.some((r) => isPendingStatus(r.id_access_status));
  const internalsTerminal =
    !internalEnabled ||
    internals.length === 0 ||
    internals.every((r) => !isPendingStatus(r.id_access_status));
  const cycleComplete = allTerminal && internalsTerminal;
  let setorApproversCount = 0;
  const setorList = await listSectorsOf(fresh.id_event_accreditation);
  const allowedSetores = new Set(memberships.map((m) => m.id_setor));
  const visibleSetorList = seesAll
    ? setorList
    : setorList.filter((s) => allowedSetores.has(Number(s.id_setor)));
  const setores = [];
  for (const s of visibleSetorList) {
    const canManageSector = await canManageSectorCompanies(req, fresh, s.id_setor);
    const approvers = await approvalsService.listEligibleApprovers(s.id_setor, 1, {
      tipoEntidade: "CREDENCIAMENTO_EVENTO",
    });
    setorApproversCount += approvers.length;
    setores.push({
      ...s,
      approvers_count: approvers.length,
      can_add_companies: canManageSector && isInscriptionOpen(fresh) && !!Number(fresh.ativo),
      can_notify_companies: canManageSector,
    });
  }
  if (!setores.length && fresh.id_setor && seesAll) {
    const approvers = await approvalsService.listEligibleApprovers(fresh.id_setor, 1, {
      tipoEntidade: "CREDENCIAMENTO_EVENTO",
    });
    setorApproversCount = approvers.length;
  }

  return {
    ...mapItemRow(fresh),
    setores,
    event_dates: await listEventDates(fresh.id_event_accreditation),
    bracelet_types: await listBraceletsOf(fresh.id_event_accreditation),
    internal_bracelet_types: internalEnabled
      ? await listInternalBraceletsOf(fresh.id_event_accreditation)
      : [],
    companies: visibleCompanies,
    internals: visibleInternals,
    my_internal: myInternal,
    my_internals: myInternals,
    can_register_internal: canRegisterInternal,
    kpis: buildKpis(visibleCompanies, decideInternal ? internals : []),
    setor_approvers_count: setorApproversCount,
    can_manage: canManage,
    can_decide: canDecide,
    can_decide_internal: decideInternal,
    can_notify: canManage,
    can_toggle_active:
      (isSuperAdmin(req.user) || Number(fresh.id_solicitante) === Number(req.user?.id)) &&
      hasPermission(req.user, "event_accreditation", "edit"),
    can_delete: canDeleteItem(req, fresh),
    can_export:
      cycleComplete && hasPermission(req.user, "event_accreditation", "view"),
    cycle_complete: cycleComplete,
    internals_pending: internalsPending,
  };
}

async function listItems(req, { page, limit, filters }) {
  const scope = buildAccreditationScope(req.user);
  const { sql: scopeSql, params: scopeParams } = buildScopeWhere(scope);
  const { where, params } = buildListBaseWhere(filters);
  const baseWhereSql = `WHERE ${where.join(" AND ")}${scopeSql}`;
  const baseParams = [...params, ...scopeParams];

  const sit = situationPredicate(filters.situation);
  const filteredWhere = sit ? [...where, sit] : where;
  const whereSql = `WHERE ${filteredWhere.join(" AND ")}${scopeSql}`;
  const allParams = [...params, ...scopeParams];

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM event_accreditation ea ${whereSql}`,
    allParams,
  );
  const [[counts]] = await db.query(
    `SELECT
        COUNT(*) AS todos,
        COALESCE(SUM(CASE WHEN ${INSCRIPTION_OPEN_SQL} THEN 1 ELSE 0 END), 0) AS abertos,
        COALESCE(SUM(CASE WHEN NOT ${INSCRIPTION_OPEN_SQL} THEN 1 ELSE 0 END), 0) AS encerrados
       FROM event_accreditation ea
       ${baseWhereSql}`,
    baseParams,
  );
  const [rows] = await db.execute(
    `SELECT ea.*,
            ast.description AS access_status_description,
            s.nome AS setor_nome,
            rc.company_name AS responsavel_company_name,
            rc.fancy_name AS responsavel_fancy_name,
            ${COMPANY_TOTAL_SQL} AS companies_total,
            ${COMPANY_DONE_SQL} AS companies_completed,
            ${PENDING_COUNT_SQL} AS pending_count
       FROM event_accreditation ea
       LEFT JOIN access_status ast ON ast.id_access_status = ea.id_access_status
       LEFT JOIN setores s ON s.id = ea.id_setor
       LEFT JOIN company rc ON rc.id_company = ea.id_company_responsavel
       ${whereSql}
      ORDER BY ${listSortClause(filters)}
      LIMIT ? OFFSET ?`,
    [...allParams, limit, (page - 1) * limit],
  );

  const items = (
    await attachCoverThumbs(await attachSectors(await attachEventDates(rows.map(mapItemRow))))
  ).map((item) => ({
    ...item,
    can_toggle_active:
      (isSuperAdmin(req.user) || Number(item.id_solicitante) === Number(req.user?.id)) &&
      hasPermission(req.user, "event_accreditation", "edit"),
    can_delete: canDeleteItem(req, item),
  }));

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    filter_counts: {
      todos: toCount(counts?.todos),
      abertos: toCount(counts?.abertos),
      encerrados: toCount(counts?.encerrados),
    },
  };
}

async function getById(req, id) {
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new AppError("Credenciamento inválido.", 400);
  }
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  return hydrateDetail(req, row);
}

async function listLinkableCompanies(req) {
  try {
    const result = await companyService.listCompanies(req, {
      page: 1,
      limit: 500,
      filters: {},
    });
    return (result.companies || [])
      .filter((c) => c.status !== false)
      .map((c) => ({
        id_company: Number(c.id_company),
        company_name: c.company_name,
        fancy_name: c.fancy_name || null,
        cnpj: c.cnpj || null,
        status: true,
      }));
  } catch {
    const [rows] = await db.execute(
      `SELECT c.id_company, c.company_name, c.fancy_name, c.cnpj, c.status
         FROM company c
        WHERE c.status = 1
        ORDER BY c.company_name ASC
        LIMIT 500`,
    );
    return rows.map((r) => ({
      id_company: Number(r.id_company),
      company_name: r.company_name,
      fancy_name: r.fancy_name || null,
      cnpj: r.cnpj || null,
      status: true,
    }));
  }
}

async function createItem(req, data) {
  if (req.user?.requires_company || req.user?.profile?.requires_company) {
    throw new AppError("Empresas não podem criar credenciamentos de evento.", 403);
  }
  const eventDates = normalizeEventDates(data.event_dates || [data.start, data.end]);
  if (!eventDates.length) throw new AppError("Selecione ao menos um dia do evento.", 400);
  const start = eventDates[0];
  const end = eventDates[eventDates.length - 1];
  const setorIds = await assertActiveSectors(data.setores || [data.id_setor]);
  const primarySetor = setorIds[0];
  const braceletIds = await resolveBraceletIds(data.bracelet_types, data.event_kind);
  const idSolicitante = req.user?.id;
  if (!idSolicitante) throw new AppError("Usuário não autenticado.", 401);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await approvalsService.ensureActiveFlowsForTipo(ENTITY_TYPE);
    if (data.internal_enabled === true) {
      await approvalsService.ensureActiveFlowsForTipo(ENTITY_TYPE_INTERNAL);
    }

    const internalEnabled = data.internal_enabled === true;
    const photoRequired = data.photo_required === true;
    const internalBraceletIds = internalEnabled
      ? await resolveBraceletIds(data.internal_bracelet_types, data.event_kind, conn)
      : [];
    const [result] = await conn.execute(
      `INSERT INTO event_accreditation
         (name, event_kind, start, end, inscription_start, inscription_end,
          id_setor, id_solicitante, id_company_responsavel, id_access_status, ativo, internal_enabled, photo_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)`,
      [
        data.name.trim(),
        data.event_kind,
        start,
        end,
        data.inscription_start,
        data.inscription_end,
        primarySetor,
        idSolicitante,
        STATUS_AGUARDANDO_PRODUTORA,
        internalEnabled ? 1 : 0,
        photoRequired ? 1 : 0,
      ],
    );
    const id = result.insertId;
    await replaceEventDates(conn, id, eventDates);
    await replaceSectors(conn, id, setorIds);
    for (const idBracelet of braceletIds) {
      await conn.execute(
        `INSERT INTO event_accreditation_bracelet (id_event_accreditation, id_bracelet_type)
         VALUES (?, ?)`,
        [id, idBracelet],
      );
    }
    for (const idBracelet of internalBraceletIds) {
      await conn.execute(
        `INSERT INTO event_accreditation_internal_bracelet (id_event_accreditation, id_bracelet_type)
         VALUES (?, ?)`,
        [id, idBracelet],
      );
    }
    await conn.commit();
    const detail = await getById(req, id);
    return { ...detail, invitedCompanyIds: [], invitedSectorIds: setorIds, internalEnabled };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function copyNameWithSuffix(name, suffix = " (cópia)", max = 200) {
  const base = String(name || "").trim() || "Evento";
  const next = `${base}${suffix}`;
  if (next.length <= max) return next;
  const cut = Math.max(1, max - suffix.length);
  return `${base.slice(0, cut)}${suffix}`;
}

async function copyAccreditationCover(sourceCover, destId) {
  const name = path.basename(String(sourceCover || ""));
  if (!name || name === "." || name.includes("..")) return;
  const src = path.join(notifications.COVER_DIR, name);
  if (!fs.existsSync(src)) return;
  const ext = path.extname(name).toLowerCase() || ".jpg";
  const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
  const filename = `${uuidv4()}${safeExt}`;
  fs.mkdirSync(notifications.COVER_DIR, { recursive: true });
  fs.copyFileSync(src, path.join(notifications.COVER_DIR, filename));
  await writeCoverThumb(filename);
  await db.execute(`UPDATE event_accreditation SET cover = ? WHERE id_event_accreditation = ?`, [
    filename,
    destId,
  ]);
}

async function duplicateItem(req, id) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  if (!canManageItem(req, row)) {
    throw new AppError("Sem permissão para duplicar este credenciamento.", 403);
  }

  const eventDates = await listEventDates(itemId);
  const setores = await listSectorsOf(itemId);
  const bracelets = await listBraceletsOf(itemId);
  const internalEnabled = !!Number(row.internal_enabled);
  const internalBracelets = internalEnabled ? await listInternalBraceletsOf(itemId) : [];

  const created = await createItem(req, {
    name: copyNameWithSuffix(row.name),
    event_kind: row.event_kind,
    event_dates: eventDates.length
      ? eventDates
      : [formatDateField(row.start), formatDateField(row.end)].filter(Boolean),
    start: formatDateField(row.start),
    end: formatDateField(row.end),
    inscription_start: row.inscription_start,
    inscription_end: row.inscription_end,
    setores: setores.map((s) => s.id_setor),
    id_setor: row.id_setor,
    bracelet_types: bracelets.map((b) => b.id_bracelet_type),
    internal_enabled: internalEnabled,
    photo_required: !!Number(row.photo_required),
    internal_bracelet_types: internalBracelets.map((b) => b.id_bracelet_type),
  });

  if (row.cover) {
    try {
      await copyAccreditationCover(row.cover, created.id_event_accreditation);
    } catch {
      /* capa opcional — o evento já foi criado */
    }
  }

  const detail = await getById(req, created.id_event_accreditation);
  return {
    ...detail,
    invitedCompanyIds: created.invitedCompanyIds || [],
    invitedSectorIds: created.invitedSectorIds || [],
    internalEnabled: created.internalEnabled,
  };
}

async function updateItem(req, id, data) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  if (!canManageItem(req, row)) {
    throw new AppError("Sem permissão para editar este credenciamento.", 403);
  }
  assertActive(row);

  const next = {
    name: data.name != null ? String(data.name).trim() : row.name,
    start: data.start != null ? toDateOnly(data.start) : formatDateField(row.start),
    end: data.end != null ? toDateOnly(data.end) : formatDateField(row.end),
    inscription_start: data.inscription_start != null ? data.inscription_start : row.inscription_start,
    inscription_end: data.inscription_end != null ? data.inscription_end : row.inscription_end,
    id_setor: data.id_setor != null ? Number(data.id_setor) : Number(row.id_setor),
    setores: data.setores != null ? uniquePositiveIds(data.setores) : null,
  };
  let nextDates = null;
  if (data.event_dates != null) {
    nextDates = normalizeEventDates(data.event_dates);
    if (!nextDates.length) throw new AppError("Selecione ao menos um dia do evento.", 400);
    next.start = nextDates[0];
    next.end = nextDates[nextDates.length - 1];
  }
  if (next.start > next.end) {
    throw new AppError("A data de início deve ser anterior ou igual à data de término.", 400);
  }

  const braceletIds =
    data.bracelet_types != null
      ? await resolveBraceletIds(data.bracelet_types, row.event_kind)
      : null;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    if (next.setores) {
      next.setores = await assertActiveSectors(next.setores, conn);
      next.id_setor = next.setores[0];
    } else if (next.id_setor !== Number(row.id_setor)) {
      next.setores = await assertActiveSectors([next.id_setor], conn);
    }
    const nextInternalEnabled =
      data.internal_enabled != null ? !!data.internal_enabled : !!Number(row.internal_enabled);
    const nextPhotoRequired =
      data.photo_required != null ? !!data.photo_required : !!Number(row.photo_required);
    if (!nextInternalEnabled) {
      const [insc] = await conn.execute(
        `SELECT COUNT(*) AS total FROM event_accreditation_internal
          WHERE id_event_accreditation = ?`,
        [itemId],
      );
      if (Number(insc[0]?.total || 0) > 0) {
        throw new AppError(
          "Não é possível desligar o credenciamento interno com usuários já inscritos.",
          409,
        );
      }
    }

    await conn.execute(
      `UPDATE event_accreditation
          SET name = ?, start = ?, end = ?, inscription_start = ?, inscription_end = ?,
              id_setor = ?, internal_enabled = ?, photo_required = ?
        WHERE id_event_accreditation = ?`,
      [
        next.name,
        next.start,
        next.end,
        next.inscription_start,
        next.inscription_end,
        next.id_setor,
        nextInternalEnabled ? 1 : 0,
        nextPhotoRequired ? 1 : 0,
        itemId,
      ],
    );

    if (nextDates) {
      await replaceEventDates(conn, itemId, nextDates);
    }

    if (next.setores) {
      const [currentSectors] = await conn.execute(
        `SELECT id_setor FROM event_accreditation_setor WHERE id_event_accreditation = ?`,
        [itemId],
      );
      const nextSet = new Set(next.setores);
      const removed = currentSectors
        .map((r) => Number(r.id_setor))
        .filter((id) => !nextSet.has(id));
      if (removed.length) {
        const ph = removed.map(() => "?").join(",");
        const [blocking] = await conn.execute(
          `SELECT eac.id_setor
             FROM event_accreditation_company eac
            WHERE eac.id_event_accreditation = ?
              AND eac.id_setor IN (${ph})
              AND (
                eac.indication_status <> ?
                OR EXISTS (
                  SELECT 1 FROM event_accreditation_collaborator eacol
                   WHERE eacol.id_event_accreditation_company = eac.id_event_accreditation_company
                )
              )`,
          [itemId, ...removed, INDICATION.INDICACAO],
        );
        if (blocking.length) {
          throw new AppError(
            "Não é possível remover um setor que já possui empresas em andamento ou aprovadas.",
            409,
          );
        }
        await conn.execute(
          `DELETE FROM event_accreditation_company
            WHERE id_event_accreditation = ?
              AND id_setor IN (${ph})`,
          [itemId, ...removed],
        );
      }
      await replaceSectors(conn, itemId, next.setores);
    }

    if (braceletIds) {
      const [used] = await conn.execute(
        `SELECT DISTINCT eacol.id_bracelet_type
           FROM event_accreditation_collaborator eacol
           INNER JOIN event_accreditation_company eac
             ON eac.id_event_accreditation_company = eacol.id_event_accreditation_company
          WHERE eac.id_event_accreditation = ?`,
        [itemId],
      );
      const nextSet = new Set(braceletIds);
      const blocked = used
        .map((r) => Number(r.id_bracelet_type))
        .filter((id) => !nextSet.has(id));
      if (blocked.length) {
        throw new AppError(
          "Não é possível remover um tipo de pulseira já atribuído a colaboradores.",
          409,
        );
      }
      await conn.execute(
        `DELETE FROM event_accreditation_bracelet WHERE id_event_accreditation = ?`,
        [itemId],
      );
      for (const idBracelet of braceletIds) {
        await conn.execute(
          `INSERT INTO event_accreditation_bracelet (id_event_accreditation, id_bracelet_type)
           VALUES (?, ?)`,
          [itemId, idBracelet],
        );
      }
    }

    if (!nextInternalEnabled) {
      await conn.execute(
        `DELETE FROM event_accreditation_internal_bracelet WHERE id_event_accreditation = ?`,
        [itemId],
      );
    } else if (data.internal_bracelet_types != null) {
      const internalBraceletIds = await resolveBraceletIds(
        data.internal_bracelet_types,
        row.event_kind,
        conn,
      );
      const [usedInternal] = await conn.execute(
        `SELECT DISTINCT id_bracelet_type
           FROM event_accreditation_internal
          WHERE id_event_accreditation = ?`,
        [itemId],
      );
      const nextInternalSet = new Set(internalBraceletIds);
      const blockedInternal = usedInternal
        .map((r) => Number(r.id_bracelet_type))
        .filter((id) => !nextInternalSet.has(id));
      if (blockedInternal.length) {
        throw new AppError(
          "Não é possível remover um tipo de pulseira já atribuído a colaboradores internos.",
          409,
        );
      }
      await conn.execute(
        `DELETE FROM event_accreditation_internal_bracelet WHERE id_event_accreditation = ?`,
        [itemId],
      );
      for (const idBracelet of internalBraceletIds) {
        await conn.execute(
          `INSERT INTO event_accreditation_internal_bracelet (id_event_accreditation, id_bracelet_type)
           VALUES (?, ?)`,
          [itemId, idBracelet],
        );
      }
    }

    const extended =
      new Date(next.inscription_end).getTime() > new Date(row.inscription_end).getTime();
    if (extended) {
      await conn.execute(
        `UPDATE event_accreditation_company
            SET indication_status = ?, indicated_complete_at = NULL
          WHERE id_event_accreditation = ?
            AND indication_status = ?
            AND NOT EXISTS (
              SELECT 1 FROM aprovacoes a
               WHERE a.tipo_entidade = ?
                 AND a.id_entidade = event_accreditation_company.id_event_accreditation_company
            )
            AND NOT EXISTS (
              SELECT 1 FROM event_accreditation_collaborator eacol
               WHERE eacol.id_event_accreditation_company =
                     event_accreditation_company.id_event_accreditation_company
                 AND eacol.id_access_status IN (?, ?)
            )`,
        [
          INDICATION.INDICACAO,
          itemId,
          INDICATION.NEGADO,
          ENTITY_TYPE,
          STATUS_APROVADO,
          STATUS_NEGADO,
        ],
      );
      await syncParentStatus(itemId, conn);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getById(req, itemId);
}

async function patchStatus(req, id, ativo) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  if (!isSuperAdmin(req.user) && Number(row.id_solicitante) !== Number(req.user?.id)) {
    throw new AppError("Somente quem criou o credenciamento pode ativar ou desativar.", 403);
  }
  const next = ativo ? 1 : 0;
  const was = row.ativo == null ? 1 : Number(row.ativo);
  await db.execute(
    `UPDATE event_accreditation SET ativo = ? WHERE id_event_accreditation = ?`,
    [next, itemId],
  );
  const item = await getById(req, itemId);
  return {
    item,
    changes: {
      wasActivated: was === 0 && next === 1,
      wasDeactivated: was === 1 && next === 0,
    },
  };
}

async function deleteAccreditationFiles(row, inviteFiles) {
  if (row.cover) {
    const name = path.basename(row.cover);
    const stored = path.join(notifications.COVER_DIR, name);
    try {
      if (fs.existsSync(stored)) fs.unlinkSync(stored);
    } catch {
      /* arquivo ausente ou sem permissão */
    }
    removeCoverThumb(name);
  }
  for (const file of inviteFiles) {
    const stored = path.join(notifications.INVITE_FILE_DIR, path.basename(file.filename));
    try {
      if (fs.existsSync(stored)) fs.unlinkSync(stored);
    } catch {
      /* arquivo ausente ou sem permissão */
    }
  }
}

async function deleteApprovalsByIds(conn, ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(", ");
  await conn.execute(`DELETE FROM aprovacao_decisoes WHERE id_aprovacao IN (${placeholders})`, ids);
  await conn.execute(`DELETE FROM aprovacoes WHERE id IN (${placeholders})`, ids);
}

async function deleteItem(req, id) {
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new AppError("Credenciamento inválido.", 400);
  }
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  if (!canDeleteItem(req, row)) {
    throw new AppError("Sem permissão para excluir este credenciamento.", 403);
  }

  const invite = await findInviteByAccreditation(itemId);
  const inviteFiles = invite ? await listInviteFiles(invite.id_event_accreditation_invite) : [];

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [companies] = await conn.execute(
      `SELECT id_event_accreditation_company FROM event_accreditation_company
        WHERE id_event_accreditation = ?`,
      [itemId],
    );
    const companyIds = companies.map((c) => Number(c.id_event_accreditation_company));
    const approvalSql = companyIds.length
      ? `SELECT id FROM aprovacoes
          WHERE (tipo_entidade = ? AND id_entidade IN (${companyIds.map(() => "?").join(", ")}))
             OR (tipo_entidade = ? AND id_entidade = ?)`
      : `SELECT id FROM aprovacoes WHERE tipo_entidade = ? AND id_entidade = ?`;
    const approvalParams = companyIds.length
      ? [ENTITY_TYPE, ...companyIds, ENTITY_TYPE_INTERNAL, itemId]
      : [ENTITY_TYPE_INTERNAL, itemId];
    const [aprovacoes] = await conn.execute(approvalSql, approvalParams);
    await deleteApprovalsByIds(
      conn,
      aprovacoes.map((a) => a.id),
    );
    await conn.execute(`DELETE FROM event_accreditation WHERE id_event_accreditation = ?`, [itemId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await deleteAccreditationFiles(row, inviteFiles);
  return {
    deleted: true,
    id_event_accreditation: itemId,
    name: row.name,
  };
}

async function addCollaborator(req, id, idCompany, payload) {
  const itemId = Number(id);
  const companyId = Number(idCompany);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertActive(row);
  if (!isInscriptionOpen(row)) {
    throw new AppError("O prazo de inscrição já encerrou.", 409);
  }
  if (!canAddCollaboratorsForCompany(req, row, companyId)) {
    throw new AppError("Sem permissão para indicar colaboradores desta empresa.", 403);
  }

  const [links] = await db.execute(
    `SELECT * FROM event_accreditation_company
      WHERE id_event_accreditation = ? AND id_company = ?
      LIMIT 1`,
    [itemId, companyId],
  );
  const link = links[0];
  if (!link) throw new AppError("Empresa não convidada neste credenciamento.", 404);

  const [bracelets] = await db.execute(
    `SELECT * FROM bracelet_type WHERE id_bracelet_type = ? AND ativo = 1 LIMIT 1`,
    [payload.id_bracelet_type],
  );
  if (!bracelets.length) throw new AppError("Tipo de pulseira inválido.", 400);
  if (!braceletMatchesKind(bracelets[0].event_kind, row.event_kind)) {
    throw new AppError("Tipo de pulseira não permitido para este tipo de evento.", 400);
  }
  const [allowed] = await db.execute(
    `SELECT 1 FROM event_accreditation_bracelet
      WHERE id_event_accreditation = ? AND id_bracelet_type = ?
      LIMIT 1`,
    [itemId, payload.id_bracelet_type],
  );
  if (!allowed.length) {
    throw new AppError("Tipo de pulseira não habilitado neste credenciamento.", 400);
  }

  const [collabs] = await db.execute(
    `SELECT * FROM collaborator WHERE id_collaborator = ? LIMIT 1`,
    [payload.id_collaborator],
  );
  if (!collabs.length) throw new AppError("Colaborador não encontrado.", 404);
  if (!Number(collabs[0].status)) {
    throw new AppError("Colaborador inativo.", 400);
  }
  await blocklistPolicy.assertNotBlocklisted(payload.id_collaborator);

  const [roles] = await db.execute(
    `SELECT 1 FROM collaborator_role WHERE id_collaborator_role = ? LIMIT 1`,
    [payload.id_collaborator_role],
  );
  if (!roles.length) throw new AppError("Função inválida.", 400);

  if (typeof collaboratorService.linkCollaboratorToCompany === "function") {
    await collaboratorService.linkCollaboratorToCompany(payload.id_collaborator, companyId);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      await conn.execute(
        `INSERT INTO event_accreditation_collaborator
           (id_event_accreditation_company, id_collaborator, id_collaborator_role,
            id_bracelet_type, id_access_status)
         VALUES (?, ?, ?, ?, ?)`,
        [
          link.id_event_accreditation_company,
          payload.id_collaborator,
          payload.id_collaborator_role,
          payload.id_bracelet_type,
          STATUS_AGUARDANDO_PRODUTORA,
        ],
      );
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        throw new AppError("Colaborador já indicado por esta empresa.", 409);
      }
      throw err;
    }
    await promoteLateIndications(conn, link, row);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getById(req, itemId);
}

async function removeCollaborator(req, id, idCompany, linkId) {
  const itemId = Number(id);
  const companyId = Number(idCompany);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertActive(row);
  if (!isInscriptionOpen(row)) {
    throw new AppError("O prazo de inscrição já encerrou.", 409);
  }
  if (!canAddCollaboratorsForCompany(req, row, companyId)) {
    throw new AppError("Sem permissão para alterar a indicação desta empresa.", 403);
  }
  const [links] = await db.execute(
    `SELECT * FROM event_accreditation_company
      WHERE id_event_accreditation = ? AND id_company = ?
      LIMIT 1`,
    [itemId, companyId],
  );
  const link = links[0];
  if (!link) throw new AppError("Empresa não convidada neste credenciamento.", 404);
  const submitted = indicationAlreadySubmitted(link);
  const [result] = await db.execute(
    submitted
      ? `DELETE FROM event_accreditation_collaborator
          WHERE id_event_accreditation_collaborator = ?
            AND id_event_accreditation_company = ?
            AND id_access_status IN (?, ?)`
      : `DELETE FROM event_accreditation_collaborator
          WHERE id_event_accreditation_collaborator = ?
            AND id_event_accreditation_company = ?`,
    submitted
      ? [
          linkId,
          link.id_event_accreditation_company,
          STATUS_AGUARDANDO_PRODUTORA,
          STATUS_AGUARDANDO_APROVACAO,
        ]
      : [linkId, link.id_event_accreditation_company],
  );
  if (!result.affectedRows) {
    throw new AppError(
      submitted
        ? "Só é possível remover colaboradores ainda pendentes."
        : "Indicação não encontrada.",
      submitted ? 409 : 404,
    );
  }
  return getById(req, itemId);
}

async function completeCompany(req, id, idCompany) {
  const itemId = Number(id);
  const companyId = Number(idCompany);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertActive(row);
  if (!isInscriptionOpen(row)) {
    throw new AppError("O prazo de inscrição já encerrou.", 409);
  }
  if (!canIndicateForCompany(req, row, companyId)) {
    throw new AppError("Sem permissão para concluir a indicação desta empresa.", 403);
  }
  const [links] = await db.execute(
    `SELECT * FROM event_accreditation_company
      WHERE id_event_accreditation = ? AND id_company = ?
      LIMIT 1`,
    [itemId, companyId],
  );
  const link = links[0];
  if (!link) throw new AppError("Empresa não convidada neste credenciamento.", 404);
  if (link.indication_status !== INDICATION.INDICACAO) {
    throw new AppError("A indicação desta empresa já foi concluída.", 409);
  }
  const total = await countCollaborators(link.id_event_accreditation_company);
  if (total === 0) {
    throw new AppError("Indique ao menos um colaborador antes de concluir.", 422);
  }
  await assertPhotosReadyForNotify(row, link.id_event_accreditation_company);

  const conn = await db.getConnection();
  let approval = null;
  try {
    await conn.beginTransaction();
    const result = await completeCompanyIndicationInternal(conn, link, row, { auto: false });
    approval = result?.approval || null;
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  const detail = await getById(req, itemId);
  return { ...detail, approvalCreated: approval };
}

function uniquePositiveIdsOrNull(ids) {
  if (!Array.isArray(ids)) return null;
  return uniquePositiveIds(ids);
}

/**
 * Ids de linha de colaborador (empresa/interno) recebidos como public_id (UUID)
 * ou id numérico → ids internos únicos. UUID desconhecido → 400.
 */
async function resolveCollaboratorRowIds(target, raw) {
  const list = Array.isArray(raw) ? raw : [];
  const uuids = [];
  const numeric = [];
  for (const value of list) {
    if (value == null || value === "") continue;
    if (isUuid(value)) uuids.push(String(value).trim().toLowerCase());
    else numeric.push(value);
  }
  const ids = uniquePositiveIds(numeric);
  if (!uuids.length) return ids;
  const spec =
    target === "internal"
      ? { table: "event_accreditation_internal", pk: "id_event_accreditation_internal" }
      : { table: "event_accreditation_collaborator", pk: "id_event_accreditation_collaborator" };
  const placeholders = uuids.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT \`${spec.pk}\` AS pk FROM \`${spec.table}\` WHERE public_id IN (${placeholders})`,
    uuids,
  );
  if (rows.length !== uuids.length) {
    throw new AppError("Um ou mais colaboradores não pertencem a este credenciamento.", 400);
  }
  return uniquePositiveIds([...ids, ...rows.map((r) => r.pk)]);
}

function nextIndicationStatus(link, counts) {
  if (counts.pending > 0) {
    if (link.indication_status === INDICATION.INDICACAO && !link.indicated_complete_at) {
      return INDICATION.INDICACAO;
    }
    return INDICATION.AGUARDANDO_APROVACAO;
  }
  if (link.indication_status === INDICATION.INDICACAO && !link.indicated_complete_at) {
    return INDICATION.INDICACAO;
  }
  return counts.approved > 0 ? INDICATION.APROVADO : INDICATION.NEGADO;
}

async function closePendingApprovalIfSettled(conn, linkId, user, companyStatus) {
  if (
    companyStatus !== INDICATION.APROVADO &&
    companyStatus !== INDICATION.NEGADO
  ) {
    return;
  }
  const [pending] = await conn.execute(
    `SELECT id, nivel_atual FROM aprovacoes
      WHERE tipo_entidade = ? AND id_entidade = ? AND status = 'PENDENTE'
      LIMIT 1`,
    [ENTITY_TYPE, linkId],
  );
  if (!pending.length) return;
  const approvalId = pending[0].id;
  const nivel = pending[0].nivel_atual || 1;
  const decisao = companyStatus === INDICATION.NEGADO ? "REPROVADO" : "APROVADO";
  const [existing] = await conn.execute(
    `SELECT 1 FROM aprovacao_decisoes WHERE id_aprovacao = ? AND nivel = ? LIMIT 1`,
    [approvalId, nivel],
  );
  if (!existing.length) {
    await conn.execute(
      `INSERT INTO aprovacao_decisoes (id_aprovacao, nivel, id_usuario, decisao, comentario)
       VALUES (?, ?, ?, ?, ?)`,
      [approvalId, nivel, user.id, decisao, "Decisão no detalhe do credenciamento"],
    );
  }
  await conn.execute(
    `UPDATE aprovacoes SET status = ?, finalizado_em = NOW() WHERE id = ?`,
    [decisao === "REPROVADO" ? "REPROVADO" : "APROVADO", approvalId],
  );
}

function indicationAlreadySubmitted(link) {
  return (
    !!link.indicated_complete_at ||
    (link.indication_status && link.indication_status !== INDICATION.INDICACAO)
  );
}

async function promoteLateIndications(conn, link, item) {
  if (!indicationAlreadySubmitted(link)) return;
  await conn.execute(
    `UPDATE event_accreditation_collaborator
        SET id_access_status = ?
      WHERE id_event_accreditation_company = ?
        AND id_access_status = ?`,
    [STATUS_AGUARDANDO_APROVACAO, link.id_event_accreditation_company, STATUS_AGUARDANDO_PRODUTORA],
  );
  await conn.execute(
    `UPDATE event_accreditation_company
        SET indication_status = ?
      WHERE id_event_accreditation_company = ?`,
    [INDICATION.AGUARDANDO_APROVACAO, link.id_event_accreditation_company],
  );
  await reopenApprovalIfNeeded(
    conn,
    { ...link, indication_status: INDICATION.AGUARDANDO_APROVACAO },
    item,
    INDICATION.AGUARDANDO_APROVACAO,
  );
  await syncParentStatus(item.id_event_accreditation, conn);
}

async function reopenApprovalIfNeeded(conn, link, item, companyStatus) {
  if (companyStatus !== INDICATION.AGUARDANDO_APROVACAO) return;
  if (!link.indicated_complete_at) return;
  const [pending] = await conn.execute(
    `SELECT id FROM aprovacoes
      WHERE tipo_entidade = ? AND id_entidade = ? AND status = 'PENDENTE'
      LIMIT 1`,
    [ENTITY_TYPE, link.id_event_accreditation_company],
  );
  if (pending.length) return;
  try {
    await approvalsService.ensureActiveFlowsForTipo(ENTITY_TYPE);
    await approvalsService.createApprovalFor(conn, {
      tipoEntidade: ENTITY_TYPE,
      idEntidade: link.id_event_accreditation_company,
      idSetor: companySectorId(link, item),
      idSolicitante: item.id_solicitante,
    });
  } catch (err) {
    if (err && err.statusCode === 409) return;
    throw err;
  }
}

async function ensureInternalApproval(conn, item) {
  const [pending] = await conn.execute(
    `SELECT id FROM aprovacoes
      WHERE tipo_entidade = ? AND id_entidade = ? AND status = 'PENDENTE'
      LIMIT 1`,
    [ENTITY_TYPE_INTERNAL, item.id_event_accreditation],
  );
  if (pending.length) return null;
  await approvalsService.ensureActiveFlowsForTipo(ENTITY_TYPE_INTERNAL);
  try {
    return await approvalsService.createApprovalFor(conn, {
      tipoEntidade: ENTITY_TYPE_INTERNAL,
      idEntidade: item.id_event_accreditation,
      idSetor: item.id_setor,
      idSolicitante: item.id_solicitante,
    });
  } catch (err) {
    if (err && err.statusCode === 409) return null;
    throw err;
  }
}

async function closeInternalApprovalIfSettled(conn, item, user) {
  const [pendingRows] = await conn.execute(
    `SELECT COUNT(*) AS total FROM event_accreditation_internal
      WHERE id_event_accreditation = ? AND id_access_status IN (?, ?)`,
    [item.id_event_accreditation, STATUS_AGUARDANDO_PRODUTORA, STATUS_AGUARDANDO_APROVACAO],
  );
  if (Number(pendingRows[0]?.total || 0) > 0) return;
  const [pending] = await conn.execute(
    `SELECT id, nivel_atual FROM aprovacoes
      WHERE tipo_entidade = ? AND id_entidade = ? AND status = 'PENDENTE'
      LIMIT 1`,
    [ENTITY_TYPE_INTERNAL, item.id_event_accreditation],
  );
  if (!pending.length) return;
  const [approved] = await conn.execute(
    `SELECT COUNT(*) AS total FROM event_accreditation_internal
      WHERE id_event_accreditation = ? AND id_access_status = ?`,
    [item.id_event_accreditation, STATUS_APROVADO],
  );
  const decisao = Number(approved[0]?.total || 0) > 0 ? "APROVADO" : "REPROVADO";
  const approvalId = pending[0].id;
  const nivel = pending[0].nivel_atual || 1;
  const [existing] = await conn.execute(
    `SELECT 1 FROM aprovacao_decisoes WHERE id_aprovacao = ? AND nivel = ? LIMIT 1`,
    [approvalId, nivel],
  );
  if (!existing.length && user?.id) {
    await conn.execute(
      `INSERT INTO aprovacao_decisoes (id_aprovacao, nivel, id_usuario, decisao, comentario)
       VALUES (?, ?, ?, ?, ?)`,
      [approvalId, nivel, user.id, decisao, "Decisão no detalhe do credenciamento"],
    );
  }
  await conn.execute(
    `UPDATE aprovacoes SET status = ?, finalizado_em = NOW() WHERE id = ?`,
    [decisao === "REPROVADO" ? "REPROVADO" : "APROVADO", approvalId],
  );
}

async function registerInternal(req, id, payload) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertActive(row);
  if (!Number(row.internal_enabled)) {
    throw new AppError("Este credenciamento não está aberto para colaboradores internos.", 409);
  }
  if (!isAdInternalUser(req.user)) {
    throw new AppError("Somente usuários internos AD podem se inscrever neste credenciamento.", 403);
  }
  if (!isInscriptionOpen(row)) {
    throw new AppError("O prazo de inscrição já encerrou.", 409);
  }
  const braceletIds = uniquePositiveIds(payload.id_bracelet_types);
  if (!braceletIds.length) throw new AppError("Selecione ao menos uma pulseira.", 400);
  const braceletPlaceholders = braceletIds.map(() => "?").join(",");
  const [bracelets] = await db.execute(
    `SELECT * FROM bracelet_type
      WHERE id_bracelet_type IN (${braceletPlaceholders}) AND ativo = 1`,
    braceletIds,
  );
  if (bracelets.length !== braceletIds.length) throw new AppError("Tipo de pulseira inválido.", 400);
  if (bracelets.some((b) => !braceletMatchesKind(b.event_kind, row.event_kind))) {
    throw new AppError("Tipo de pulseira não permitido para este tipo de evento.", 400);
  }
  const [allowed] = await db.execute(
    `SELECT id_bracelet_type FROM event_accreditation_internal_bracelet
      WHERE id_event_accreditation = ? AND id_bracelet_type IN (${braceletPlaceholders})`,
    [itemId, ...braceletIds],
  );
  if (allowed.length !== braceletIds.length) {
    throw new AppError("Tipo de pulseira não habilitado para colaboradores internos.", 400);
  }
  const [already] = await db.execute(
    `SELECT id_bracelet_type FROM event_accreditation_internal
      WHERE id_event_accreditation = ? AND id_usuario = ?
        AND id_bracelet_type IN (${braceletPlaceholders})`,
    [itemId, req.user.id, ...braceletIds],
  );
  if (already.length) {
    throw new AppError("Você já está inscrito com uma destas pulseiras.", 409);
  }

  const conn = await db.getConnection();
  let approval = null;
  try {
    await conn.beginTransaction();
    try {
      for (const braceletId of braceletIds) {
        await conn.execute(
          `INSERT INTO event_accreditation_internal
             (id_event_accreditation, id_usuario, id_bracelet_type, id_access_status)
           VALUES (?, ?, ?, ?)`,
          [itemId, req.user.id, braceletId, STATUS_AGUARDANDO_APROVACAO],
        );
      }
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        throw new AppError("Você já está inscrito com uma destas pulseiras.", 409);
      }
      throw err;
    }
    approval = await ensureInternalApproval(conn, row);
    await syncParentStatus(itemId, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  const detail = await getById(req, itemId);
  return { ...detail, approvalCreated: approval };
}

async function unregisterInternal(req, id) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertActive(row);
  if (!isAdInternalUser(req.user)) {
    throw new AppError("Somente usuários internos AD podem cancelar a própria inscrição.", 403);
  }
  if (!isInscriptionOpen(row)) {
    throw new AppError("O prazo de inscrição já encerrou.", 409);
  }
  const [rows] = await db.execute(
    `SELECT * FROM event_accreditation_internal
      WHERE id_event_accreditation = ? AND id_usuario = ?`,
    [itemId, req.user.id],
  );
  if (!rows.length) throw new AppError("Inscrição não encontrada.", 404);
  const pending = rows.filter((r) => isPendingStatus(r.id_access_status));
  if (!pending.length) {
    throw new AppError("Não é possível cancelar uma inscrição já decidida.", 409);
  }
  const placeholders = pending.map(() => "?").join(",");
  await db.execute(
    `DELETE FROM event_accreditation_internal
      WHERE id_event_accreditation_internal IN (${placeholders})`,
    pending.map((r) => r.id_event_accreditation_internal),
  );
  return getById(req, itemId);
}

async function decideInternals(req, itemId, row, payload) {
  if (!canDecideInternal(req, row)) {
    throw new AppError("Sem permissão para decidir colaboradores internos.", 403);
  }
  const ids = uniquePositiveIds(payload.ids);
  if (!ids.length) throw new AppError("Selecione ao menos um colaborador interno.", 400);
  const action = payload.action;
  const decisionReason =
    action === "block" ? formatDecisionReason(payload.reason, payload.note) : null;
  if (action === "block" && !decisionReason) {
    throw new AppError("Informe o motivo do bloqueio.", 400);
  }
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await db.execute(
    `SELECT * FROM event_accreditation_internal
      WHERE id_event_accreditation = ?
        AND id_event_accreditation_internal IN (${placeholders})`,
    [itemId, ...ids],
  );
  if (rows.length !== ids.length) {
    throw new AppError("Um ou mais colaboradores internos não pertencem a este credenciamento.", 400);
  }
  for (const col of rows) {
    const st = Number(col.id_access_status);
    if (action === "approve" && !isPendingStatus(st)) {
      throw new AppError("Só é possível aprovar colaboradores pendentes.", 409);
    }
    if (action === "block" && !(isPendingStatus(st) || st === STATUS_APROVADO)) {
      throw new AppError("Só é possível bloquear colaboradores pendentes ou aprovados.", 409);
    }
    if (action === "unblock" && !isBlockedStatus(st)) {
      throw new AppError("Só é possível desbloquear colaboradores bloqueados.", 409);
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const col of rows) {
      let nextStatus = Number(col.id_access_status);
      let nextReason = col.decision_reason || null;
      if (action === "approve") {
        nextStatus = STATUS_APROVADO;
        nextReason = null;
      } else if (action === "block") {
        nextStatus = STATUS_NEGADO;
        nextReason = decisionReason;
      } else {
        nextStatus = STATUS_AGUARDANDO_APROVACAO;
        nextReason = null;
      }
      await conn.execute(
        `UPDATE event_accreditation_internal
            SET id_access_status = ?, decided_by = ?, decided_at = NOW(), decision_reason = ?
          WHERE id_event_accreditation_internal = ?`,
        [nextStatus, req.user.id, nextReason, col.id_event_accreditation_internal],
      );
    }
    const [stillPending] = await conn.execute(
      `SELECT COUNT(*) AS total FROM event_accreditation_internal
        WHERE id_event_accreditation = ? AND id_access_status IN (?, ?)`,
      [itemId, STATUS_AGUARDANDO_PRODUTORA, STATUS_AGUARDANDO_APROVACAO],
    );
    if (Number(stillPending[0]?.total || 0) > 0) {
      await ensureInternalApproval(conn, row);
    } else {
      await closeInternalApprovalIfSettled(conn, row, req.user);
    }
    await syncParentStatus(itemId, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getById(req, itemId);
}

async function changeBracelet(req, id, payload) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertActive(row);
  const canDecide = await canDecideItem(req, row);

  const braceletId = Number(payload.id_bracelet_type);
  const [bracelets] = await db.execute(
    `SELECT * FROM bracelet_type WHERE id_bracelet_type = ? AND ativo = 1 LIMIT 1`,
    [braceletId],
  );
  if (!bracelets.length) throw new AppError("Tipo de pulseira inválido.", 400);
  if (!braceletMatchesKind(bracelets[0].event_kind, row.event_kind)) {
    throw new AppError("Tipo de pulseira não permitido para este tipo de evento.", 400);
  }

  const ids = await resolveCollaboratorRowIds(
    payload.target,
    payload.ids || (payload.id != null ? [payload.id] : []),
  );
  if (!ids.length) throw new AppError("Selecione ao menos um colaborador.", 400);
  const placeholders = ids.map(() => "?").join(",");

  if (payload.target === "internal") {
    if (!canDecideInternal(req, row)) {
      throw new AppError("Sem permissão para alterar a pulseira deste credenciamento.", 403);
    }
    const [allowed] = await db.execute(
      `SELECT 1 FROM event_accreditation_internal_bracelet
        WHERE id_event_accreditation = ? AND id_bracelet_type = ?
        LIMIT 1`,
      [itemId, braceletId],
    );
    if (!allowed.length) {
      throw new AppError("Esta pulseira não está liberada para colaboradores internos.", 400);
    }
    const [rows] = await db.execute(
      `SELECT id_event_accreditation_internal, id_access_status, id_bracelet_type
         FROM event_accreditation_internal
        WHERE id_event_accreditation = ?
          AND id_event_accreditation_internal IN (${placeholders})`,
      [itemId, ...ids],
    );
    if (rows.length !== ids.length) {
      throw new AppError("Um ou mais colaboradores internos não pertencem a este credenciamento.", 400);
    }
    if (rows.some((r) => !isPendingStatus(Number(r.id_access_status)))) {
      throw new AppError("Só é possível trocar a pulseira de inscrições pendentes.", 409);
    }
    try {
      await db.execute(
        `UPDATE event_accreditation_internal SET id_bracelet_type = ?
          WHERE id_event_accreditation = ?
            AND id_event_accreditation_internal IN (${placeholders})`,
        [braceletId, itemId, ...ids],
      );
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        throw new AppError("Este colaborador já possui esta pulseira.", 409);
      }
      throw err;
    }
    return getById(req, itemId);
  }

  const [allowed] = await db.execute(
    `SELECT 1 FROM event_accreditation_bracelet
      WHERE id_event_accreditation = ? AND id_bracelet_type = ?
      LIMIT 1`,
    [itemId, braceletId],
  );
  if (!allowed.length) {
    throw new AppError("Esta pulseira não está liberada neste credenciamento.", 400);
  }
  const [rows] = await db.execute(
    `SELECT eacol.id_event_accreditation_collaborator, eacol.id_access_status, eacol.id_bracelet_type,
            eac.id_company, eac.indication_status, eac.id_setor
       FROM event_accreditation_collaborator eacol
       INNER JOIN event_accreditation_company eac
         ON eac.id_event_accreditation_company = eacol.id_event_accreditation_company
      WHERE eac.id_event_accreditation = ?
        AND eacol.id_event_accreditation_collaborator IN (${placeholders})`,
    [itemId, ...ids],
  );
  if (rows.length !== ids.length) {
    throw new AppError("Um ou mais colaboradores não pertencem a este credenciamento.", 400);
  }
  if (!canDecide) {
    if (!isInscriptionOpen(row)) {
      throw new AppError("O prazo de inscrição já encerrou.", 409);
    }
    for (const item of rows) {
      if (!canAddCollaboratorsForCompany(req, row, item.id_company)) {
        throw new AppError("Sem permissão para alterar a pulseira deste credenciamento.", 403);
      }
    }
  } else {
    for (const item of rows) {
      const idSetor = companySectorId(item, row);
      if (!(await canDecideForSector(req, row, idSetor))) {
        throw new AppError("Sem permissão para alterar a pulseira deste setor.", 403);
      }
    }
  }
  if (rows.some((r) => !isPendingStatus(Number(r.id_access_status)))) {
    throw new AppError("Só é possível trocar a pulseira de colaboradores pendentes.", 409);
  }
  await db.execute(
    `UPDATE event_accreditation_collaborator SET id_bracelet_type = ?
      WHERE id_event_accreditation_collaborator IN (${placeholders})`,
    [braceletId, ...ids],
  );
  return getById(req, itemId);
}

async function decideCollaborators(req, id, payload) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertActive(row);
  if (!(await canDecideItem(req, row))) {
    throw new AppError("Sem permissão para decidir colaboradores deste credenciamento.", 403);
  }
  if (payload.target === "internal") {
    return decideInternals(req, itemId, row, payload);
  }

  const action = payload.action;
  const ids = uniquePositiveIds(payload.ids);
  if (!ids.length) throw new AppError("Selecione ao menos um colaborador.", 400);
  const decisionReason =
    action === "block" ? formatDecisionReason(payload.reason, payload.note) : null;
  if (action === "block" && !decisionReason) {
    throw new AppError("Informe o motivo do bloqueio.", 400);
  }

  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await db.execute(
    `SELECT eacol.id_event_accreditation_collaborator,
            eacol.id_event_accreditation_company,
            eacol.id_collaborator,
            eacol.id_access_status,
            eac.indication_status,
            eac.indicated_complete_at,
            eac.id_event_accreditation,
            eac.id_setor
       FROM event_accreditation_collaborator eacol
       INNER JOIN event_accreditation_company eac
         ON eac.id_event_accreditation_company = eacol.id_event_accreditation_company
      WHERE eac.id_event_accreditation = ?
        AND eacol.id_event_accreditation_collaborator IN (${placeholders})`,
    [itemId, ...ids],
  );
  if (rows.length !== ids.length) {
    throw new AppError("Um ou mais colaboradores não pertencem a este credenciamento.", 400);
  }

  for (const col of rows) {
    const idSetor = companySectorId(col, row);
    if (!(await canDecideForSector(req, row, idSetor))) {
      throw new AppError("Sem permissão para decidir colaboradores deste setor.", 403);
    }
  }

  for (const col of rows) {
    const st = Number(col.id_access_status);
    if (action === "approve" && !isPendingStatus(st)) {
      throw new AppError("Só é possível aprovar colaboradores pendentes.", 409);
    }
    if (action === "block" && !(isPendingStatus(st) || st === STATUS_APROVADO)) {
      throw new AppError("Só é possível bloquear colaboradores pendentes ou aprovados.", 409);
    }
    if (action === "unblock" && !isBlockedStatus(st)) {
      throw new AppError("Só é possível desbloquear colaboradores bloqueados.", 409);
    }
  }

  if (action === "approve") {
    const collabIds = rows.map((r) => Number(r.id_collaborator));
    const ph = collabIds.map(() => "?").join(",");
    const [blocklisted] = await db.execute(
      `SELECT c.name
         FROM collaborator c
         INNER JOIN collaborator_block_list bl ON bl.id_collaborator = c.id_collaborator
          AND ${blocklistPolicy.activeBlockJoinSql("bl")}
        WHERE c.id_collaborator IN (${ph})`,
      collabIds,
    );
    if (blocklisted.length) {
      throw new AppError(
        `Colaborador(es) na lista de restrição não podem ser aprovados: ${blocklisted.map((r) => r.name).join(", ")}`,
        403,
      );
    }
  }

  const companyIds = [...new Set(rows.map((r) => Number(r.id_event_accreditation_company)))];
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const userId = req.user.id;
    for (const col of rows) {
      const linkCompleted = !!col.indicated_complete_at;
      let nextStatus = Number(col.id_access_status);
      let nextReason = col.decision_reason || null;
      if (action === "approve") {
        nextStatus = STATUS_APROVADO;
        nextReason = null;
      } else if (action === "block") {
        nextStatus = STATUS_NEGADO;
        nextReason = decisionReason;
      } else {
        nextStatus = linkCompleted ? STATUS_AGUARDANDO_APROVACAO : STATUS_AGUARDANDO_PRODUTORA;
        nextReason = null;
      }
      await conn.execute(
        `UPDATE event_accreditation_collaborator
            SET id_access_status = ?, decided_by = ?, decided_at = NOW(), decision_reason = ?
          WHERE id_event_accreditation_collaborator = ?`,
        [nextStatus, userId, nextReason, col.id_event_accreditation_collaborator],
      );
    }

    for (const linkId of companyIds) {
      const [links] = await conn.execute(
        `SELECT * FROM event_accreditation_company
          WHERE id_event_accreditation_company = ? LIMIT 1`,
        [linkId],
      );
      const link = links[0];
      if (!link) continue;
      const counts = await countCompanyStatuses(linkId, conn);
      const companyStatus = nextIndicationStatus(link, counts);
      await conn.execute(
        `UPDATE event_accreditation_company SET indication_status = ?
          WHERE id_event_accreditation_company = ?`,
        [companyStatus, linkId],
      );
      await closePendingApprovalIfSettled(conn, linkId, req.user, companyStatus);
      await reopenApprovalIfNeeded(conn, link, row, companyStatus);
    }
    await syncParentStatus(itemId, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  if (action === "approve") {
    const facialCommand = require("../facial/facial.command.service");
    facialCommand.scheduleRevokeUnlessReleasedToday(
      rows.map((r) => r.id_collaborator),
      "accreditation_approved_without_portaria",
    );
  }
  const detail = await getById(req, itemId);
  for (const company of detail.companies || []) {
    if (
      companyIds.includes(Number(company.id_event_accreditation_company)) &&
      (company.indication_status === INDICATION.APROVADO ||
        company.indication_status === INDICATION.NEGADO)
    ) {
      const missingPhotos = Number(company.missing_photo_count || 0);
      if (detail.photo_required && missingPhotos > 0) continue;
      notifications
        .notifyOwnerValidated({
          item: detail,
          companyName: company.fancy_name || company.company_name,
          status: company.indication_status,
          usuarioId: req.user?.id,
        })
        .catch(() => {});
      logNotify({
        idAccreditation: itemId,
        idCompanyLink: company.id_event_accreditation_company,
        idSetor: company.id_setor,
        tipo: NOTIFY_TIPO.OWNER_VALIDATED,
        userId: req.user?.id,
      }).catch(() => {});
    }
  }
  return detail;
}

async function sendCompanyInvites(req, item, companyIds, { reminder = false } = {}) {
  const mapped = mapItemRow(item);
  const invite = await findInviteByAccreditation(item.id_event_accreditation);
  const files = invite ? await listInviteFiles(invite.id_event_accreditation_invite) : [];
  const inviteHtml = notifications.isUsableInviteHtml(invite?.html)
    ? invite.html
    : await notifications.buildDefaultInviteHtml(mapped);
  return notifications.sendInviteToCompanies({
    item: mapped,
    companyIds,
    subject: reminder
      ? `Lembrete: ${invite?.subject || notifications.buildDefaultInviteSubject(mapped)}`
      : invite?.subject || notifications.buildDefaultInviteSubject(mapped),
    html: inviteHtml,
    files,
    usuarioId: req.user?.id,
    requestId: req.requestId,
    context: reminder ? { reminder: true } : {},
  });
}

async function addSectorCompanies(req, id, idSetor, payload) {
  const itemId = Number(id);
  const setorId = Number(idSetor);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertActive(row);
  await assertSectorParticipates(itemId, setorId);
  if (!(await canManageSectorCompanies(req, row, setorId))) {
    throw new AppError("Sem permissão para indicar empresas deste setor.", 403);
  }
  await approvalsService.ensureActiveFlowsForTipo(ENTITY_TYPE);
  if (!isInscriptionOpen(row)) {
    throw new AppError("O prazo de inscrição já encerrou.", 409);
  }
  const companyIds = uniquePositiveIds(payload.companies);
  if (!companyIds.length) {
    throw new AppError("Selecione ao menos uma empresa.", 400);
  }

  const added = [];
  for (const idCompany of companyIds) {
    const company = await companyService.findActiveCompanyById(idCompany);
    if (!company) {
      throw new AppError("Uma ou mais empresas selecionadas não existem ou estão inativas.", 400);
    }
    const [existing] = await db.execute(
      `SELECT id_event_accreditation_company, id_setor
         FROM event_accreditation_company
        WHERE id_event_accreditation = ? AND id_company = ?
        LIMIT 1`,
      [itemId, idCompany],
    );
    if (existing.length) {
      if (Number(existing[0].id_setor) !== setorId) {
        throw new AppError(
          "Esta empresa já participa deste credenciamento em outro setor.",
          409,
        );
      }
      continue;
    }
    await db.execute(
      `INSERT INTO event_accreditation_company (id_event_accreditation, id_company, id_setor)
       VALUES (?, ?, ?)`,
      [itemId, idCompany, setorId],
    );
    added.push(idCompany);
  }
  if (added.length) {
    await sendCompanyInvites(req, row, added);
    for (const idCompany of added) {
      const [links] = await db.execute(
        `SELECT id_event_accreditation_company FROM event_accreditation_company
          WHERE id_event_accreditation = ? AND id_company = ? LIMIT 1`,
        [itemId, idCompany],
      );
      await logNotify({
        idAccreditation: itemId,
        idCompanyLink: links[0]?.id_event_accreditation_company || null,
        idSetor: setorId,
        tipo: NOTIFY_TIPO.COMPANY_INVITE,
        userId: req.user?.id,
      });
    }
  }
  const item = await getById(req, itemId);
  return { item, added: added.length };
}

async function removeSectorCompany(req, id, idSetor, idCompany) {
  const itemId = Number(id);
  const setorId = Number(idSetor);
  const companyId = Number(idCompany);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertActive(row);
  await assertSectorParticipates(itemId, setorId);
  if (!(await canManageSectorCompanies(req, row, setorId))) {
    throw new AppError("Sem permissão para remover empresas deste setor.", 403);
  }
  const [links] = await db.execute(
    `SELECT * FROM event_accreditation_company
      WHERE id_event_accreditation = ? AND id_company = ? AND id_setor = ?
      LIMIT 1`,
    [itemId, companyId, setorId],
  );
  const link = links[0];
  if (!link) throw new AppError("Empresa não encontrada neste setor.", 404);
  if (link.indication_status !== INDICATION.INDICACAO) {
    throw new AppError("Só é possível remover empresas ainda em indicação.", 409);
  }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `DELETE FROM event_accreditation_collaborator
        WHERE id_event_accreditation_company = ?
          AND id_access_status IN (?, ?)`,
      [
        link.id_event_accreditation_company,
        STATUS_AGUARDANDO_PRODUTORA,
        STATUS_AGUARDANDO_APROVACAO,
      ],
    );
    const leftover = await countCollaborators(link.id_event_accreditation_company, conn);
    if (leftover > 0) {
      throw new AppError(
        "Não é possível remover uma empresa com colaboradores já decididos.",
        409,
      );
    }
    const [aprovacoes] = await conn.execute(
      `SELECT id FROM aprovacoes WHERE tipo_entidade = ? AND id_entidade = ?`,
      [ENTITY_TYPE, link.id_event_accreditation_company],
    );
    await deleteApprovalsByIds(
      conn,
      aprovacoes.map((a) => a.id),
    );
    await conn.execute(
      `DELETE FROM event_accreditation_company WHERE id_event_accreditation_company = ?`,
      [link.id_event_accreditation_company],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getById(req, itemId);
}

async function notifySectorCompanies(req, id, idSetor, payload = {}) {
  const itemId = Number(id);
  const setorId = Number(idSetor);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  await assertSectorParticipates(itemId, setorId);
  if (!(await canManageSectorCompanies(req, row, setorId))) {
    throw new AppError("Sem permissão para notificar empresas deste setor.", 403);
  }
  const [links] = await db.execute(
    `SELECT id_company, id_event_accreditation_company FROM event_accreditation_company
      WHERE id_event_accreditation = ? AND id_setor = ? AND indication_status = ?`,
    [itemId, setorId, INDICATION.INDICACAO],
  );
  let companyIds = links.map((r) => Number(r.id_company));
  if (payload.id_company) {
    const target = Number(payload.id_company);
    if (!companyIds.includes(target)) {
      throw new AppError("A empresa não está em indicação neste setor.", 409);
    }
    companyIds = [target];
  }
  if (!companyIds.length) {
    throw new AppError("Nenhuma empresa em indicação para notificar.", 409);
  }
  const results = await sendCompanyInvites(req, row, companyIds, { reminder: true });
  for (const link of links.filter((r) => companyIds.includes(Number(r.id_company)))) {
    await logNotify({
      idAccreditation: itemId,
      idCompanyLink: link.id_event_accreditation_company,
      idSetor: setorId,
      tipo: NOTIFY_TIPO.COMPANY_INVITE,
      userId: req.user?.id,
    });
  }
  const sent = results.reduce((acc, r) => acc + Number(r.sent || 0), 0);
  const item = await getById(req, itemId);
  return { item, sent, companies: results.length };
}

async function notifySectorIndication(req, id, idCompany) {
  const itemId = Number(id);
  const companyId = Number(idCompany);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  const [links] = await db.execute(
    `SELECT eac.*, c.company_name, c.fancy_name
       FROM event_accreditation_company eac
       INNER JOIN company c ON c.id_company = eac.id_company
      WHERE eac.id_event_accreditation = ? AND eac.id_company = ?
      LIMIT 1`,
    [itemId, companyId],
  );
  const link = links[0];
  if (!link) throw new AppError("Empresa não convidada neste credenciamento.", 404);
  if (!canIndicateForCompany(req, row, companyId) && !canManageItem(req, row)) {
    throw new AppError("Sem permissão para notificar o setor desta empresa.", 403);
  }
  if (link.indication_status === INDICATION.INDICACAO) {
    throw new AppError("Conclua a indicação antes de notificar o setor.", 409);
  }
  await assertPhotosReadyForNotify(row, link.id_event_accreditation_company);
  const mapped = mapItemRow(row);
  notifications.notifySectorIndication({
    item: mapped,
    companyName: link.fancy_name || link.company_name,
    idSetor: companySectorId(link, row),
    usuarioId: req.user?.id,
  });
  await logNotify({
    idAccreditation: itemId,
    idCompanyLink: link.id_event_accreditation_company,
    idSetor: companySectorId(link, row),
    tipo: NOTIFY_TIPO.SECTOR_INDICATION,
    userId: req.user?.id,
  });
  return getById(req, itemId);
}

async function notifyOwnerValidated(req, id, idCompany) {
  const itemId = Number(id);
  const companyId = Number(idCompany);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  const [links] = await db.execute(
    `SELECT eac.*, c.company_name, c.fancy_name
       FROM event_accreditation_company eac
       INNER JOIN company c ON c.id_company = eac.id_company
      WHERE eac.id_event_accreditation = ? AND eac.id_company = ?
      LIMIT 1`,
    [itemId, companyId],
  );
  const link = links[0];
  if (!link) throw new AppError("Empresa não convidada neste credenciamento.", 404);
  const idSetor = companySectorId(link, row);
  if (!(await canDecideForSector(req, row, idSetor))) {
    throw new AppError("Sem permissão para notificar o responsável deste credenciamento.", 403);
  }
  if (
    link.indication_status !== INDICATION.APROVADO &&
    link.indication_status !== INDICATION.NEGADO
  ) {
    throw new AppError("Valide a indicação antes de notificar o responsável.", 409);
  }
  if (isPhotoRequiredActive(row)) {
    const missing = await countMissingPhotos(link.id_event_accreditation_company);
    if (missing > 0) {
      throw new AppError(missingPhotoNotifyMessage(missing), 409);
    }
  }
  const mapped = mapItemRow(row);
  await notifications.notifyOwnerValidated({
    item: mapped,
    companyName: link.fancy_name || link.company_name,
    status: link.indication_status,
    usuarioId: req.user?.id,
  });
  await logNotify({
    idAccreditation: itemId,
    idCompanyLink: link.id_event_accreditation_company,
    idSetor: idSetor,
    tipo: NOTIFY_TIPO.OWNER_VALIDATED,
    userId: req.user?.id,
  });
  return getById(req, itemId);
}

async function notifyCompanies(req, id, payload = {}) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  const canManage =
    canManageItem(req, row) && hasPermission(req.user, "event_accreditation", "edit");
  const memberships = await listUserSectorsOnAccreditation(req.user?.id, itemId);
  const canSector = memberships.some((m) => SECTOR_MANAGE_PAPEIS.includes(m.papel));
  if (!canManage && !canSector) {
    throw new AppError("Sem permissão para notificar empresas deste credenciamento.", 403);
  }

  const sectorFilter = !canManage
    ? memberships.filter((m) => SECTOR_MANAGE_PAPEIS.includes(m.papel)).map((m) => m.id_setor)
    : [];
  const [links] = await db.execute(
    `SELECT id_company, id_setor FROM event_accreditation_company
      WHERE id_event_accreditation = ?
        AND indication_status = ?`,
    [itemId, INDICATION.INDICACAO],
  );
  let companyIds = links
    .filter((r) => !sectorFilter.length || sectorFilter.includes(Number(r.id_setor)))
    .map((r) => Number(r.id_company));
  if (payload.id_company) {
    const target = Number(payload.id_company);
    if (!companyIds.includes(target)) {
      throw new AppError("A empresa não está em indicação neste credenciamento.", 409);
    }
    companyIds = [target];
  }
  if (!companyIds.length) {
    throw new AppError("Nenhuma empresa em indicação para notificar.", 409);
  }

  const mapped = mapItemRow(row);
  const invite = await findInviteByAccreditation(itemId);
  const files = invite ? await listInviteFiles(invite.id_event_accreditation_invite) : [];
  const inviteHtml = notifications.isUsableInviteHtml(invite?.html)
    ? invite.html
    : await notifications.buildDefaultInviteHtml(mapped);
  const results = await notifications.sendInviteToCompanies({
    item: mapped,
    companyIds,
    subject: invite?.subject || notifications.buildDefaultInviteSubject(mapped),
    html: inviteHtml,
    files,
    usuarioId: req.user?.id,
    requestId: req.requestId,
    context: { reminder: true },
  });
  const sent = results.reduce((acc, r) => acc + Number(r.sent || 0), 0);
  const item = await getById(req, itemId);
  return { item, sent, companies: results.length };
}

async function markApprovedInternal(conn, idEntidade, ctx = {}) {
  const itemId = Number(idEntidade);
  const approvedIds = uniquePositiveIdsOrNull(ctx.approvedCollaboratorIds);
  const [all] = await conn.execute(
    `SELECT id_event_accreditation_internal
       FROM event_accreditation_internal
      WHERE id_event_accreditation = ?`,
    [itemId],
  );
  if (!all.length) return;
  const selected = approvedIds
    ? new Set(approvedIds)
    : new Set(all.map((r) => Number(r.id_event_accreditation_internal)));
  for (const row of all) {
    const id = Number(row.id_event_accreditation_internal);
    const next = selected.has(id) ? STATUS_APROVADO : STATUS_NEGADO;
    await conn.execute(
      `UPDATE event_accreditation_internal
          SET id_access_status = ?
        WHERE id_event_accreditation_internal = ?
          AND id_access_status IN (?, ?)`,
      [next, id, STATUS_AGUARDANDO_PRODUTORA, STATUS_AGUARDANDO_APROVACAO],
    );
  }
  await syncParentStatus(itemId, conn);
}

async function markRejectedInternal(conn, idEntidade) {
  const itemId = Number(idEntidade);
  await conn.execute(
    `UPDATE event_accreditation_internal
        SET id_access_status = ?
      WHERE id_event_accreditation = ?
        AND id_access_status IN (?, ?)`,
    [STATUS_NEGADO, itemId, STATUS_AGUARDANDO_PRODUTORA, STATUS_AGUARDANDO_APROVACAO],
  );
  await syncParentStatus(itemId, conn);
}

async function markApproved(conn, idEntidade, ctx = {}) {
  const linkId = Number(idEntidade);
  const approvedIds = uniquePositiveIdsOrNull(ctx.approvedCollaboratorIds);
  const [links] = await conn.execute(
    `SELECT * FROM event_accreditation_company WHERE id_event_accreditation_company = ? LIMIT 1`,
    [linkId],
  );
  const link = links[0];
  if (!link) return;

  const [all] = await conn.execute(
    `SELECT id_event_accreditation_collaborator, id_collaborator
       FROM event_accreditation_collaborator
      WHERE id_event_accreditation_company = ?`,
    [linkId],
  );

  const selected = approvedIds
    ? new Set(approvedIds)
    : new Set(all.map((r) => Number(r.id_event_accreditation_collaborator)));

  if (approvedIds && approvedIds.length) {
    const owned = all.filter((r) => selected.has(Number(r.id_event_accreditation_collaborator)));
    if (owned.length !== approvedIds.length) {
      throw new AppError(
        "Um ou mais colaboradores selecionados não pertencem a esta empresa.",
        400,
      );
    }
    const [blocklisted] = await conn.execute(
      `SELECT c.name
         FROM event_accreditation_collaborator eacol
         INNER JOIN collaborator c ON c.id_collaborator = eacol.id_collaborator
         INNER JOIN collaborator_block_list bl ON bl.id_collaborator = eacol.id_collaborator
          AND ${blocklistPolicy.activeBlockJoinSql("bl")}
        WHERE eacol.id_event_accreditation_company = ?
          AND eacol.id_event_accreditation_collaborator IN (${approvedIds.map(() => "?").join(",")})`,
      [linkId, ...approvedIds],
    );
    if (blocklisted.length) {
      throw new AppError(
        `Colaborador(es) na lista de restrição não podem ser aprovados: ${blocklisted.map((r) => r.name).join(", ")}`,
        403,
      );
    }
  }

  for (const row of all) {
    const id = Number(row.id_event_accreditation_collaborator);
    const next = selected.has(id) ? STATUS_APROVADO : STATUS_NEGADO;
    await conn.execute(
      `UPDATE event_accreditation_collaborator
          SET id_access_status = ?
        WHERE id_event_accreditation_collaborator = ?
          AND id_access_status IN (?, ?)`,
      [next, id, STATUS_AGUARDANDO_PRODUTORA, STATUS_AGUARDANDO_APROVACAO],
    );
  }

  const [approvedCount] = await conn.execute(
    `SELECT COUNT(*) AS total FROM event_accreditation_collaborator
      WHERE id_event_accreditation_company = ? AND id_access_status = ?`,
    [linkId, STATUS_APROVADO],
  );
  const companyStatus =
    Number(approvedCount[0]?.total || 0) > 0 ? INDICATION.APROVADO : INDICATION.NEGADO;
  await conn.execute(
    `UPDATE event_accreditation_company SET indication_status = ?
      WHERE id_event_accreditation_company = ?`,
    [companyStatus, linkId],
  );
  await syncParentStatus(link.id_event_accreditation, conn);
  const facialCommand = require("../facial/facial.command.service");
  facialCommand.scheduleRevokeUnlessReleasedToday(
    all.filter((row) => selected.has(Number(row.id_event_accreditation_collaborator))).map((row) => row.id_collaborator),
    "accreditation_approved_without_portaria",
  );
}

async function markRejected(conn, idEntidade) {
  const linkId = Number(idEntidade);
  const [links] = await conn.execute(
    `SELECT * FROM event_accreditation_company WHERE id_event_accreditation_company = ? LIMIT 1`,
    [linkId],
  );
  const link = links[0];
  if (!link) return;
  await conn.execute(
    `UPDATE event_accreditation_collaborator
        SET id_access_status = ?
      WHERE id_event_accreditation_company = ?
        AND id_access_status IN (?, ?)`,
    [STATUS_NEGADO, linkId, STATUS_AGUARDANDO_PRODUTORA, STATUS_AGUARDANDO_APROVACAO],
  );
  await conn.execute(
    `UPDATE event_accreditation_company SET indication_status = ?
      WHERE id_event_accreditation_company = ?`,
    [INDICATION.NEGADO, linkId],
  );
  await syncParentStatus(link.id_event_accreditation, conn);
}

async function markExpired(conn, idEntidade) {
  return markRejected(conn, idEntidade);
}

const EXPORT_COLUMNS = [
  { header: "Empresa", key: "empresa", width: 32 },
  { header: "Colaborador", key: "nome", width: 32 },
  { header: "Documento", key: "documento", width: 18 },
  { header: "Função", key: "funcao", width: 22 },
  { header: "Pulseira", key: "pulseira", width: 22 },
  { header: "Status", key: "status", width: 22 },
  { header: "Foto", key: "foto", width: 12 },
  { header: "Arquivo da foto", key: "arquivo_foto", width: 36 },
];

const PDF_FONT_REGULAR = "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf";
const PDF_FONT_BOLD = "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf";

function sanitizeExportSheetName(raw, used) {
  let name = String(raw || "Setor")
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  if (!name) name = "Setor";
  let candidate = name;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i})`;
    candidate = `${name.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function sanitizePersonFileName(raw) {
  const base = String(raw || "colaborador")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return base || "colaborador";
}

function uniquePhotoName(rawName, ext, used) {
  const base = sanitizePersonFileName(rawName);
  const suffix = ext && String(ext).startsWith(".") ? String(ext).toLowerCase() : `.${String(ext || "jpg").toLowerCase()}`;
  let candidate = `${base}${suffix}`;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${i}${suffix}`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function resolveCollaboratorPhoto(picture, personName, usedNames) {
  const file = safePicturePath(picture);
  if (!file) return null;
  return {
    filePath: file.filePath,
    zipName: uniquePhotoName(personName, file.ext || ".jpg", usedNames),
  };
}

async function readPhotoThumb(filePath, size = 96) {
  const sharp = require("sharp");
  return sharp(filePath)
    .rotate()
    .resize(size, size, { fit: "cover" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

function companyExportRows(company, usedPhotoNames) {
  const empresa = company.fancy_name || company.company_name;
  if (!(company.collaborators || []).length) {
    return [
      {
        empresa,
        nome: "—",
        documento: "",
        funcao: "",
        pulseira: "",
        status: company.indication_status === INDICATION.NEGADO ? "Sem indicação" : "—",
        foto: "",
        arquivo_foto: "",
        photoFile: null,
      },
    ];
  }
  return (company.collaborators || []).map((c) => {
    const photoFile = resolveCollaboratorPhoto(
      c.collaborator_picture,
      c.collaborator_name,
      usedPhotoNames,
    );
    return {
      empresa,
      nome: c.collaborator_name,
      documento: c.collaborator_document,
      funcao: c.role_description,
      pulseira: c.bracelet_name,
      status: c.access_status_description,
      foto: photoFile ? "" : "Sem foto",
      arquivo_foto: photoFile ? `fotos/${photoFile.zipName}` : "Sem foto",
      photoFile,
    };
  });
}

function collectExportPeople(detail, usedPhotoNames) {
  const people = [];
  const sheetGroups = [];

  if ((detail.internals || []).length) {
    const rows = detail.internals.map((c) => ({
      empresa: "Colaboradores internos",
      nome: c.nome_completo,
      documento: c.email,
      funcao: c.departamento || "Interno AD",
      pulseira: c.bracelet_name,
      status: c.access_status_description,
      foto: "Sem foto",
      arquivo_foto: "Sem foto",
      photoFile: null,
    }));
    sheetGroups.push({ name: "Colaboradores internos", rows });
    people.push(...rows);
  }

  for (const company of detail.companies || []) {
    const rows = companyExportRows(company, usedPhotoNames);
    sheetGroups.push({
      name: company.fancy_name || company.company_name,
      rows,
    });
    people.push(...rows.filter((r) => r.nome !== "—"));
  }

  return { people, sheetGroups };
}

async function addExportSheet(workbook, name, rows, usedNames) {
  const sheet = workbook.addWorksheet(sanitizeExportSheetName(name, usedNames));
  sheet.columns = EXPORT_COLUMNS;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle" };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const excelRow = sheet.addRow({
      empresa: row.empresa,
      nome: row.nome,
      documento: row.documento,
      funcao: row.funcao,
      pulseira: row.pulseira,
      status: row.status,
      foto: row.photoFile ? "" : row.foto || "",
      arquivo_foto: row.arquivo_foto || "",
    });
    excelRow.alignment = { vertical: "middle", wrapText: true };
    if (!row.photoFile) continue;
    try {
      const thumb = await readPhotoThumb(row.photoFile.filePath, 96);
      const imageId = workbook.addImage({ buffer: thumb, extension: "jpeg" });
      excelRow.height = 52;
      sheet.addImage(imageId, {
        tl: { col: 6, row: i + 1 },
        ext: { width: 48, height: 48 },
        editAs: "oneCell",
      });
    } catch {
      excelRow.getCell("foto").value = "Sem foto";
    }
  }
  return sheet;
}

async function buildExportWorkbook(sheetGroups) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Credenciamento";
  const usedNames = new Set();
  if (!sheetGroups.length) {
    await addExportSheet(workbook, "Lista", [], usedNames);
  } else {
    for (const group of sheetGroups) {
      await addExportSheet(workbook, group.name, group.rows, usedNames);
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function drawPdfNoPhoto(doc, x, y, size, font) {
  doc.save();
  doc.roundedRect(x, y, size, size, 6).lineWidth(1).strokeColor("#cccccc").stroke();
  doc.font(font).fontSize(11).fillColor("#888888").text("Sem foto", x, y + size / 2 - 6, {
    width: size,
    align: "center",
  });
  doc.restore();
}

async function buildExportPdf(title, people) {
  const chunks = [];
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: title, Author: "Credenciamento" },
  });
  const done = new Promise((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const hasRegular = fs.existsSync(PDF_FONT_REGULAR);
  const hasBold = fs.existsSync(PDF_FONT_BOLD);
  if (hasRegular) doc.registerFont("ExportSans", PDF_FONT_REGULAR);
  if (hasBold) doc.registerFont("ExportSansBold", PDF_FONT_BOLD);
  const regular = hasRegular ? "ExportSans" : "Helvetica";
  const bold = hasBold ? "ExportSansBold" : "Helvetica-Bold";

  const list = people.length
    ? people
    : [
        {
          empresa: "—",
          nome: "Nenhum colaborador",
          documento: "",
          funcao: "",
          pulseira: "",
          status: "—",
          photoFile: null,
        },
      ];

  for (let i = 0; i < list.length; i += 1) {
    if (i > 0) doc.addPage();
    const person = list[i];
    doc.font(bold).fontSize(16).fillColor("#111111").text(title, { width: 500 });
    doc.moveDown(0.25);
    doc.font(regular).fontSize(10).fillColor("#666666").text("Ficha de credenciamento", { width: 500 });
    doc.moveDown(1);

    const photoX = 48;
    const photoY = doc.y;
    const photoSize = 140;
    const textX = photoX + photoSize + 24;
    const textW = doc.page.width - textX - 48;

    if (person.photoFile) {
      try {
        const thumb = await readPhotoThumb(person.photoFile.filePath, 280);
        doc.image(thumb, photoX, photoY, {
          width: photoSize,
          height: photoSize,
          fit: [photoSize, photoSize],
        });
      } catch {
        drawPdfNoPhoto(doc, photoX, photoY, photoSize, regular);
      }
    } else {
      drawPdfNoPhoto(doc, photoX, photoY, photoSize, regular);
    }

    const fields = [
      ["Nome", person.nome],
      ["Documento", person.documento],
      ["Empresa", person.empresa],
      ["Função", person.funcao],
      ["Pulseira", person.pulseira],
      ["Situação", person.status],
    ];
    let y = photoY;
    for (const [label, value] of fields) {
      doc.font(regular).fontSize(9).fillColor("#666666").text(label, textX, y, { width: textW });
      doc.font(bold).fontSize(12).fillColor("#111111").text(value || "—", textX, y + 12, { width: textW });
      y += 28;
    }
  }

  doc.end();
  return done;
}

async function archiveExportPack({ slug, xlsxBuffer, pdfBuffer, photos }) {
  const { ZipArchive } = await import("archiver");
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("data", (c) => chunks.push(c));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    archive.append(xlsxBuffer, { name: `${slug}.xlsx` });
    archive.append(pdfBuffer, { name: `${slug}.pdf` });
    if (photos.length) {
      for (const photo of photos) {
        archive.file(photo.filePath, { name: `fotos/${photo.zipName}` });
      }
    } else {
      archive.append("", { name: "fotos/" });
    }
    archive.finalize();
  });
}

async function exportXlsx(req, id) {
  const detail = await getById(req, id);
  if (!detail.cycle_complete) {
    throw new AppError(
      "A exportação só é permitida após o término do ciclo de indicação e aprovação de todas as empresas.",
      409,
    );
  }

  const usedPhotoNames = new Set();
  const { people, sheetGroups } = collectExportPeople(detail, usedPhotoNames);
  const photos = people.map((p) => p.photoFile).filter(Boolean);

  const [xlsxBuffer, pdfBuffer] = await Promise.all([
    buildExportWorkbook(sheetGroups),
    buildExportPdf(detail.name || "Credenciamento", people),
  ]);

  const safe = String(detail.name || "credenciamento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const slug = `credenciamento-eventos-${safe || detail.id_event_accreditation}`;
  const buffer = await archiveExportPack({ slug, xlsxBuffer, pdfBuffer, photos });
  return { buffer, filename: `${slug}.zip` };
}

async function listBraceletTypes({ event_kind, includeInactive = false } = {}) {
  const where = [];
  const params = [];
  if (!includeInactive) {
    where.push("ativo = 1");
  }
  if (event_kind === "SHOWDAY" || event_kind === "JOGO") {
    where.push("(event_kind = ? OR event_kind = 'BOTH')");
    params.push(event_kind);
  }
  const sql = `SELECT * FROM bracelet_type ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
               ORDER BY name ASC`;
  const [rows] = await db.execute(sql, params);
  return rows.map(mapBraceletRow);
}

async function createBraceletType(data) {
  try {
    const [result] = await db.execute(
      `INSERT INTO bracelet_type (name, event_kind, icon, color, ativo) VALUES (?, ?, ?, ?, ?)`,
      [
        data.name.trim(),
        data.event_kind,
        data.icon || DEFAULT_BRACELET_ICON,
        data.color || DEFAULT_BRACELET_COLOR,
        data.ativo === false ? 0 : 1,
      ],
    );
    const [rows] = await db.execute(
      `SELECT * FROM bracelet_type WHERE id_bracelet_type = ? LIMIT 1`,
      [result.insertId],
    );
    return rows[0];
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      throw new AppError("Já existe um tipo de pulseira com este nome.", 409);
    }
    throw err;
  }
}

async function updateBraceletType(id, data) {
  const typeId = Number(id);
  const [existing] = await db.execute(
    `SELECT * FROM bracelet_type WHERE id_bracelet_type = ? LIMIT 1`,
    [typeId],
  );
  if (!existing.length) throw new AppError("Tipo de pulseira não encontrado.", 404);
  const nextName = data.name != null ? String(data.name).trim() : existing[0].name;
  const nextKind = data.event_kind != null ? data.event_kind : existing[0].event_kind;
  const nextIcon = data.icon != null ? data.icon : existing[0].icon || DEFAULT_BRACELET_ICON;
  const nextColor = data.color != null ? data.color : existing[0].color || DEFAULT_BRACELET_COLOR;
  const nextAtivo =
    data.ativo != null ? (data.ativo ? 1 : 0) : Number(existing[0].ativo);
  try {
    await db.execute(
      `UPDATE bracelet_type SET name = ?, event_kind = ?, icon = ?, color = ?, ativo = ? WHERE id_bracelet_type = ?`,
      [nextName, nextKind, nextIcon, nextColor, nextAtivo, typeId],
    );
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      throw new AppError("Já existe um tipo de pulseira com este nome.", 409);
    }
    throw err;
  }
  const [rows] = await db.execute(
    `SELECT * FROM bracelet_type WHERE id_bracelet_type = ? LIMIT 1`,
    [typeId],
  );
  return rows[0];
}

function assertCanManageInvite(req, row) {
  const canManage =
    canManageItem(req, row) &&
    (hasPermission(req.user, "event_accreditation", "edit") ||
      hasPermission(req.user, "event_accreditation", "create"));
  if (!canManage) {
    throw new AppError("Sem permissão para gerenciar o convite deste credenciamento.", 403);
  }
}

function mapInviteRow(row, files = []) {
  return {
    id_event_accreditation_invite: Number(row.id_event_accreditation_invite),
    id_event_accreditation: Number(row.id_event_accreditation),
    subject: row.subject,
    html: row.html,
    send_at: row.send_at,
    sent_at: row.sent_at,
    status: row.status,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    files: files.map(mapInviteFileRow),
  };
}

function mapInviteFileRow(row) {
  return {
    id_event_accreditation_invite_file: Number(row.id_event_accreditation_invite_file),
    original_name: row.original_name,
    filename: row.filename,
    mime: row.mime,
    size_bytes: Number(row.size_bytes),
    criado_em: row.criado_em,
  };
}

async function findInviteByAccreditation(idAccreditation, conn = db) {
  const [rows] = await conn.execute(
    `SELECT * FROM event_accreditation_invite WHERE id_event_accreditation = ? LIMIT 1`,
    [idAccreditation],
  );
  return rows[0] || null;
}

async function listInviteFiles(inviteId, conn = db) {
  const [rows] = await conn.execute(
    `SELECT * FROM event_accreditation_invite_file
      WHERE id_event_accreditation_invite = ?
      ORDER BY id_event_accreditation_invite_file ASC`,
    [inviteId],
  );
  return rows;
}

async function ensureInviteDraft(item, conn = db) {
  const existing = await findInviteByAccreditation(item.id_event_accreditation, conn);
  if (existing && notifications.isUsableInviteHtml(existing.html)) return existing;
  const html = await notifications.buildDefaultInviteHtml(item);
  if (existing) {
    await conn.execute(
      `UPDATE event_accreditation_invite SET html = ? WHERE id_event_accreditation_invite = ?`,
      [html, existing.id_event_accreditation_invite],
    );
    existing.html = html;
    return existing;
  }
  const subject = notifications.buildDefaultInviteSubject(item);
  const [result] = await conn.execute(
    `INSERT INTO event_accreditation_invite
       (id_event_accreditation, subject, html, status)
     VALUES (?, ?, ?, 'DRAFT')`,
    [item.id_event_accreditation, subject, html],
  );
  const [rows] = await conn.execute(
    `SELECT * FROM event_accreditation_invite WHERE id_event_accreditation_invite = ? LIMIT 1`,
    [result.insertId],
  );
  return rows[0];
}

function inscriptionStartAt8am(inscriptionStart) {
  const day = toSaoPauloDate(inscriptionStart);
  if (!day) return new Date();
  return new Date(`${day}T08:00:00-03:00`);
}

async function listInvitedCompanyIds(itemId, conn = db) {
  const [links] = await conn.execute(
    `SELECT id_company FROM event_accreditation_company WHERE id_event_accreditation = ?`,
    [itemId],
  );
  return links.map((r) => Number(r.id_company));
}

async function deliverInvite(itemId, { usuarioId = null, requestId = null, companyIds = null } = {}) {
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  const item = mapItemRow(row);
  const invite = await ensureInviteDraft(item);
  const files = await listInviteFiles(invite.id_event_accreditation_invite);
  const ids = companyIds && companyIds.length ? companyIds : await listInvitedCompanyIds(itemId);
  if (!ids.length) {
    throw new AppError("Nenhuma empresa convidada para notificar.", 409);
  }
  const results = await notifications.sendInviteToCompanies({
    item,
    companyIds: ids,
    subject: invite.subject,
    html: invite.html,
    files,
    usuarioId,
    requestId,
  });
  await db.execute(
    `UPDATE event_accreditation_invite
        SET status = 'SENT', sent_at = NOW(), send_at = COALESCE(send_at, NOW())
      WHERE id_event_accreditation_invite = ?`,
    [invite.id_event_accreditation_invite],
  );
  const sent = results.reduce((acc, r) => acc + Number(r.sent || 0), 0);
  return { sent, companies: results.length, results };
}

async function uploadCover(req, id) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertCanManageInvite(req, row);
  if (!req.file) throw new AppError("Envie o arquivo da capa.", 400);

  fs.mkdirSync(notifications.COVER_DIR, { recursive: true });
  const ext = path.extname(req.file.originalname || ".jpg").toLowerCase() || ".jpg";
  const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
  const filename = `${uuidv4()}${safeExt}`;
  fs.writeFileSync(path.join(notifications.COVER_DIR, filename), req.file.buffer);
  await writeCoverThumb(filename);

  if (row.cover) {
    const oldName = path.basename(row.cover);
    const old = path.join(notifications.COVER_DIR, oldName);
    if (fs.existsSync(old)) fs.unlinkSync(old);
    removeCoverThumb(oldName);
  }
  await db.execute(`UPDATE event_accreditation SET cover = ? WHERE id_event_accreditation = ?`, [
    filename,
    itemId,
  ]);
  return getById(req, itemId);
}

async function getInvite(req, id) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertCanManageInvite(req, row);
  const item = mapItemRow(row);
  const invite = await ensureInviteDraft(item);
  const files = await listInviteFiles(invite.id_event_accreditation_invite);
  return { invite: mapInviteRow(invite, files), item };
}

async function saveInvite(req, id, payload) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertCanManageInvite(req, row);
  const item = mapItemRow(row);
  const invite = await ensureInviteDraft(item);
  if (invite.status === "SENT") {
    throw new AppError("Este convite já foi enviado.", 409);
  }
  await db.execute(
    `UPDATE event_accreditation_invite
        SET subject = ?, html = ?, status = IF(status = 'SKIPPED', 'DRAFT', status)
      WHERE id_event_accreditation_invite = ?`,
    [payload.subject, payload.html, invite.id_event_accreditation_invite],
  );
  const fresh = await findInviteByAccreditation(itemId);
  const files = await listInviteFiles(fresh.id_event_accreditation_invite);
  return { invite: mapInviteRow(fresh, files) };
}

async function addInviteFile(req, id) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertCanManageInvite(req, row);
  if (!req.file) throw new AppError("Envie o arquivo do anexo.", 400);
  const item = mapItemRow(row);
  const invite = await ensureInviteDraft(item);
  if (invite.status === "SENT") {
    throw new AppError("Este convite já foi enviado.", 409);
  }
  const existing = await listInviteFiles(invite.id_event_accreditation_invite);
  if (existing.length >= 5) {
    throw new AppError("Limite de 5 anexos por convite.", 400);
  }

  fs.mkdirSync(notifications.INVITE_FILE_DIR, { recursive: true });
  const ext = path.extname(req.file.originalname || "").toLowerCase() || ".bin";
  const filename = `${uuidv4()}${ext}`;
  fs.writeFileSync(path.join(notifications.INVITE_FILE_DIR, filename), req.file.buffer);
  await db.execute(
    `INSERT INTO event_accreditation_invite_file
       (id_event_accreditation_invite, original_name, filename, mime, size_bytes)
     VALUES (?, ?, ?, ?, ?)`,
    [
      invite.id_event_accreditation_invite,
      String(req.file.originalname || filename).slice(0, 255),
      filename,
      req.file.mimetype || "application/octet-stream",
      req.file.size || req.file.buffer.length,
    ],
  );
  const files = await listInviteFiles(invite.id_event_accreditation_invite);
  const fresh = await findInviteByAccreditation(itemId);
  return { invite: mapInviteRow(fresh, files) };
}

async function deleteInviteFile(req, id, fileId) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertCanManageInvite(req, row);
  const invite = await findInviteByAccreditation(itemId);
  if (!invite) throw new AppError("Convite não encontrado.", 404);
  if (invite.status === "SENT") {
    throw new AppError("Este convite já foi enviado.", 409);
  }
  const [files] = await db.execute(
    `SELECT * FROM event_accreditation_invite_file
      WHERE id_event_accreditation_invite_file = ?
        AND id_event_accreditation_invite = ?
      LIMIT 1`,
    [Number(fileId), invite.id_event_accreditation_invite],
  );
  const file = files[0];
  if (!file) throw new AppError("Anexo não encontrado.", 404);
  const stored = path.join(notifications.INVITE_FILE_DIR, path.basename(file.filename));
  if (fs.existsSync(stored)) fs.unlinkSync(stored);
  await db.execute(
    `DELETE FROM event_accreditation_invite_file WHERE id_event_accreditation_invite_file = ?`,
    [file.id_event_accreditation_invite_file],
  );
  const remaining = await listInviteFiles(invite.id_event_accreditation_invite);
  const fresh = await findInviteByAccreditation(itemId);
  return { invite: mapInviteRow(fresh, remaining) };
}

async function sendInvite(req, id, payload) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertCanManageInvite(req, row);
  const item = mapItemRow(row);
  const invite = await ensureInviteDraft(item);
  if (invite.status === "SENT") {
    throw new AppError("Este convite já foi enviado.", 409);
  }

  if (payload.mode === "skip") {
    await db.execute(
      `UPDATE event_accreditation_invite
          SET status = 'SKIPPED', send_at = NULL
        WHERE id_event_accreditation_invite = ?`,
      [invite.id_event_accreditation_invite],
    );
    const fresh = await findInviteByAccreditation(itemId);
    const files = await listInviteFiles(fresh.id_event_accreditation_invite);
    return { invite: mapInviteRow(fresh, files), sent: 0, companies: 0, item: await getById(req, itemId) };
  }

  if (payload.mode === "schedule") {
    const sendAt = inscriptionStartAt8am(row.inscription_start);
    if (sendAt.getTime() > Date.now()) {
      await db.execute(
        `UPDATE event_accreditation_invite
            SET status = 'SCHEDULED', send_at = ?
          WHERE id_event_accreditation_invite = ?`,
        [sendAt, invite.id_event_accreditation_invite],
      );
      const fresh = await findInviteByAccreditation(itemId);
      const files = await listInviteFiles(fresh.id_event_accreditation_invite);
      return {
        invite: mapInviteRow(fresh, files),
        sent: 0,
        companies: 0,
        scheduled: true,
        send_at: sendAt,
        item: await getById(req, itemId),
      };
    }
  }

  const delivery = await deliverInvite(itemId, {
    usuarioId: req.user?.id,
    requestId: req.requestId,
  });
  const fresh = await findInviteByAccreditation(itemId);
  const files = await listInviteFiles(fresh.id_event_accreditation_invite);
  return {
    invite: mapInviteRow(fresh, files),
    sent: delivery.sent,
    companies: delivery.companies,
    item: await getById(req, itemId),
  };
}

async function dispatchDueInvites() {
  const [rows] = await db.execute(
    `SELECT id_event_accreditation, id_event_accreditation_invite
       FROM event_accreditation_invite
      WHERE status = 'SCHEDULED'
        AND send_at IS NOT NULL
        AND send_at <= NOW()`,
  );
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deliverInvite(row.id_event_accreditation);
      sent += 1;
    } catch (err) {
      failed += 1;
      require("../../config/logger").logger.warn(
        { err, id_event_accreditation: row.id_event_accreditation },
        "Falha ao disparar convite de credenciamento agendado",
      );
    }
  }
  return { ok: failed === 0, sent, failed, total: rows.length };
}

async function assertCanBulkIndicate(req, id, idCompany) {
  const itemId = Number(id);
  const companyId = Number(idCompany);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  assertActive(row);
  if (!isInscriptionOpen(row)) {
    throw new AppError("O prazo de inscrição já encerrou.", 409);
  }
  if (!canAddCollaboratorsForCompany(req, row, companyId)) {
    throw new AppError("Sem permissão para indicar colaboradores desta empresa.", 403);
  }
  const [links] = await db.execute(
    `SELECT eac.*, c.company_name, c.fancy_name
       FROM event_accreditation_company eac
       INNER JOIN company c ON c.id_company = eac.id_company
      WHERE eac.id_event_accreditation = ? AND eac.id_company = ?
      LIMIT 1`,
    [itemId, companyId],
  );
  const link = links[0];
  if (!link) throw new AppError("Empresa não convidada neste credenciamento.", 404);
  const bracelets = (await listBraceletsOf(itemId)).filter((b) => b.ativo);
  return { row, link, bracelets };
}

async function getCompanyBulkImportTemplate(req, id, idCompany) {
  const { bracelets } = await assertCanBulkIndicate(req, id, idCompany);
  const helpers = require("../patrimonial/service-access-bulk-import");
  const { types, roles } = await helpers.loadLookups();
  const flow = require("./event-accreditation-bulk-import.flow");
  return flow.buildTemplate({ types, roles, bracelets });
}

async function previewCompanyBulkImport(req, id, idCompany, file) {
  const { row, link, bracelets } = await assertCanBulkIndicate(req, id, idCompany);
  const flow = require("./event-accreditation-bulk-import.flow");
  return flow.previewUnifiedBulkImport({
    accreditationId: Number(id),
    companyId: Number(idCompany),
    accreditationCompanyId: Number(link.id_event_accreditation_company),
    eventName: row.name,
    companyName: link.fancy_name || link.company_name || null,
    bracelets,
    file,
    userId: req.user?.id || null,
  });
}

async function confirmCompanyBulkImport(req, id, idCompany, body) {
  const { row, link, bracelets } = await assertCanBulkIndicate(req, id, idCompany);
  const previewToken = body.previewToken || body.previewId;
  if (!previewToken) {
    throw new AppError("previewToken é obrigatório.", 400);
  }
  const flow = require("./event-accreditation-bulk-import.flow");
  const result = await flow.confirmUnifiedBulkImport({
    accreditationId: Number(id),
    companyId: Number(idCompany),
    accreditationCompanyId: Number(link.id_event_accreditation_company),
    previewToken,
    decisoes: body.decisoes || {},
    userId: req.user?.id || null,
    allowedBraceletIds: bracelets.map((b) => b.id_bracelet_type),
  });
  if (indicationAlreadySubmitted(link)) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await promoteLateIndications(conn, link, row);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
  return result;
}

module.exports = {
  ENTITY_TYPE,
  INDICATION,
  parseListQuery,
  parseListFilters,
  listItems,
  getById,
  assertCanRead,
  createItem,
  duplicateItem,
  updateItem,
  patchStatus,
  deleteItem,
  addCollaborator,
  removeCollaborator,
  completeCompany,
  addSectorCompanies,
  removeSectorCompany,
  notifySectorCompanies,
  notifySectorIndication,
  notifyOwnerValidated,
  listCreateSectors,
  registerInternal,
  unregisterInternal,
  changeBracelet,
  decideCollaborators,
  notifyCompanies,
  markApproved,
  markRejected,
  markExpired,
  markApprovedInternal,
  markRejectedInternal,
  exportXlsx,
  sanitizePersonFileName,
  uniquePhotoName,
  collectExportPeople,
  listBraceletTypes,
  createBraceletType,
  updateBraceletType,
  listLinkableCompanies,
  findById,
  hasCollaboratorPicture,
  countsTowardPhotoGate,
  countMissingPhotosFromList,
  missingPhotoNotifyMessage,
  missingPhotoSectorMessage,
  mapBraceletRow,
  uploadCover,
  getInvite,
  saveInvite,
  addInviteFile,
  deleteInviteFile,
  sendInvite,
  dispatchDueInvites,
  getCompanyBulkImportTemplate,
  previewCompanyBulkImport,
  confirmCompanyBulkImport,
};
