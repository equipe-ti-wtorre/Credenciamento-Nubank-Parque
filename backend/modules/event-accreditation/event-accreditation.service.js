const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const ExcelJS = require("exceljs");
const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const companyService = require("../companies/company.service");
const collaboratorService = require("../collaborators/collaborator.service");
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
    if (scope.includeInternal) {
      return {
        sql: ` AND (
          EXISTS (
            SELECT 1 FROM setor_usuarios su
             WHERE su.id_setor = ${alias}.id_setor
               AND su.id_usuario = ?
               AND su.ativo = 1
          )
          OR ${alias}.internal_enabled = 1
        )`,
        params: [scope.userId],
      };
    }
    return {
      sql: ` AND EXISTS (
        SELECT 1 FROM setor_usuarios su
         WHERE su.id_setor = ${alias}.id_setor
           AND su.id_usuario = ?
           AND su.ativo = 1
      )`,
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
    const [rows] = await db.execute(
      `SELECT 1 FROM setor_usuarios
        WHERE id_setor = ? AND id_usuario = ? AND ativo = 1
        LIMIT 1`,
      [row.id_setor, scope.userId],
    );
    if (rows.length) return;
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

function canIndicateForCompany(req, row, idCompany) {
  const userCompany =
    req.user?.id_company != null ? Number(req.user.id_company) : null;
  return userCompany != null && userCompany === Number(idCompany);
}

function isPendingStatus(status) {
  const st = Number(status);
  return st === STATUS_AGUARDANDO_PRODUTORA || st === STATUS_AGUARDANDO_APROVACAO;
}

function isBlockedStatus(status) {
  const st = Number(status);
  return st === STATUS_NEGADO || st === STATUS_EXPIRADO;
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
  const approvers = await approvalsService.listEligibleApprovers(idSetor, 1);
  return approvers.some((a) => Number(a.id) === Number(userId));
}

async function canDecideItem(req, row) {
  if (isSuperAdmin(req.user)) return true;
  if (canManageItem(req, row) && hasPermission(req.user, "event_accreditation", "edit")) {
    return true;
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
    `SELECT eac.*, c.company_name, c.fancy_name,
            a.id AS id_aprovacao, a.status AS aprovacao_status
       FROM event_accreditation_company eac
       INNER JOIN company c ON c.id_company = eac.id_company
       LEFT JOIN aprovacoes a
         ON a.tipo_entidade = ?
        AND a.id_entidade = eac.id_event_accreditation_company
        AND a.status = 'PENDENTE'
      WHERE eac.id_event_accreditation = ?${extra}
      ORDER BY c.company_name ASC`,
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
      idSetor: item.id_setor,
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
          idSetor: row.id_setor,
          idSolicitante: row.id_solicitante,
        }).catch(() => {});
      } catch {
        /* notificação opcional */
      }
    }
  }
  const fresh = await findById(row.id_event_accreditation);
  const onlyCompany = partnerOnlyCompanyId(req, fresh);
  const companyRows = await listCompaniesOf(fresh.id_event_accreditation, onlyCompany);
  const companies = [];
  for (const c of companyRows) {
    companies.push({
      id_event_accreditation_company: c.id_event_accreditation_company,
      id_company: Number(c.id_company),
      company_name: c.company_name,
      fancy_name: c.fancy_name || null,
      indication_status: c.indication_status,
      indicated_complete_at: formatDateTimeField(c.indicated_complete_at),
      id_aprovacao: c.id_aprovacao != null ? Number(c.id_aprovacao) : null,
      aprovacao_status: c.aprovacao_status || null,
      can_indicate:
        c.indication_status === INDICATION.INDICACAO &&
        isInscriptionOpen(fresh) &&
        !!Number(fresh.ativo) &&
        canIndicateForCompany(req, fresh, c.id_company),
      can_complete:
        c.indication_status === INDICATION.INDICACAO &&
        isInscriptionOpen(fresh) &&
        !!Number(fresh.ativo) &&
        canIndicateForCompany(req, fresh, c.id_company),
      collaborators: await listCollaboratorsOfCompany(c.id_event_accreditation_company),
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
  const scope = buildAccreditationScope(req.user);
  const hideCompanies = scope.mode === "internal";
  const visibleCompanies = hideCompanies ? [] : companies;
  const internalEnabled = !!Number(fresh.internal_enabled);
  const internals = internalEnabled
    ? await listInternalRegistrations(fresh.id_event_accreditation)
    : [];
  const myInternal =
    internals.find((r) => Number(r.id_usuario) === Number(req.user?.id)) || null;
  const canRegisterInternal =
    internalEnabled &&
    isAdInternalUser(req.user) &&
    isInscriptionOpen(fresh) &&
    !!Number(fresh.ativo) &&
    !myInternal;
  const internalsPending = internals.some((r) => isPendingStatus(r.id_access_status));
  const internalsTerminal =
    !internalEnabled ||
    internals.length === 0 ||
    internals.every((r) => !isPendingStatus(r.id_access_status));
  const cycleComplete = allTerminal && internalsTerminal;
  let setorApproversCount = 0;
  if (fresh.id_setor) {
    const approvers = await approvalsService.listEligibleApprovers(fresh.id_setor, 1);
    setorApproversCount = approvers.length;
  }

  return {
    ...mapItemRow(fresh),
    event_dates: await listEventDates(fresh.id_event_accreditation),
    bracelet_types: await listBraceletsOf(fresh.id_event_accreditation),
    internal_bracelet_types: internalEnabled
      ? await listInternalBraceletsOf(fresh.id_event_accreditation)
      : [],
    companies: visibleCompanies,
    internals:
      scope.mode === "internal" && !canManage && !canDecide
        ? myInternal
          ? [myInternal]
          : []
        : internals,
    my_internal: myInternal,
    can_register_internal: canRegisterInternal,
    kpis: buildKpis(visibleCompanies, internals),
    setor_approvers_count: setorApproversCount,
    can_manage: canManage,
    can_decide: canDecide,
    can_notify: canManage,
    can_toggle_active:
      (isSuperAdmin(req.user) || Number(fresh.id_solicitante) === Number(req.user?.id)) &&
      hasPermission(req.user, "event_accreditation", "edit"),
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

  const items = (await attachCoverThumbs(await attachEventDates(rows.map(mapItemRow)))).map((item) => ({
    ...item,
    can_toggle_active:
      (isSuperAdmin(req.user) || Number(item.id_solicitante) === Number(req.user?.id)) &&
      hasPermission(req.user, "event_accreditation", "edit"),
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
  const companyIds = uniquePositiveIds(data.companies);
  if (!companyIds.length) {
    throw new AppError("Selecione ao menos uma empresa para indicar colaboradores.", 400);
  }
  const braceletIds = await resolveBraceletIds(data.bracelet_types, data.event_kind);
  const idSolicitante = req.user?.id;
  if (!idSolicitante) throw new AppError("Usuário não autenticado.", 401);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await approvalsService.assertUserCanOpenForSector(conn, data.id_setor, req.user);
    await approvalsService.ensureActiveFlowsForTipo(ENTITY_TYPE);
    if (data.internal_enabled === true) {
      await approvalsService.ensureActiveFlowsForTipo(ENTITY_TYPE_INTERNAL);
    }

    for (const idCompany of companyIds) {
      const company = await companyService.findActiveCompanyById(idCompany);
      if (!company) {
        throw new AppError("Uma ou mais empresas selecionadas não existem ou estão inativas.", 400);
      }
    }

    const internalEnabled = data.internal_enabled === true;
    const internalBraceletIds = internalEnabled
      ? await resolveBraceletIds(data.internal_bracelet_types, data.event_kind, conn)
      : [];
    const [result] = await conn.execute(
      `INSERT INTO event_accreditation
         (name, event_kind, start, end, inscription_start, inscription_end,
          id_setor, id_solicitante, id_company_responsavel, id_access_status, ativo, internal_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?)`,
      [
        data.name.trim(),
        data.event_kind,
        start,
        end,
        data.inscription_start,
        data.inscription_end,
        data.id_setor,
        idSolicitante,
        STATUS_AGUARDANDO_PRODUTORA,
        internalEnabled ? 1 : 0,
      ],
    );
    const id = result.insertId;
    await replaceEventDates(conn, id, eventDates);
    for (const idCompany of companyIds) {
      await conn.execute(
        `INSERT INTO event_accreditation_company (id_event_accreditation, id_company)
         VALUES (?, ?)`,
        [id, idCompany],
      );
    }
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
    return { ...detail, invitedCompanyIds: companyIds, internalEnabled };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
    if (next.id_setor !== Number(row.id_setor)) {
      await approvalsService.assertUserCanOpenForSector(conn, next.id_setor, req.user);
    }
    const nextInternalEnabled =
      data.internal_enabled != null ? !!data.internal_enabled : !!Number(row.internal_enabled);
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
              id_setor = ?, internal_enabled = ?
        WHERE id_event_accreditation = ?`,
      [
        next.name,
        next.start,
        next.end,
        next.inscription_start,
        next.inscription_end,
        next.id_setor,
        nextInternalEnabled ? 1 : 0,
        itemId,
      ],
    );

    if (nextDates) {
      await replaceEventDates(conn, itemId, nextDates);
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
  if (!canIndicateForCompany(req, row, companyId)) {
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
  if (link.indication_status !== INDICATION.INDICACAO) {
    throw new AppError("A indicação desta empresa já foi concluída.", 409);
  }

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
  const [blocked] = await db.execute(
    `SELECT 1 FROM collaborator_block_list WHERE id_collaborator = ? LIMIT 1`,
    [payload.id_collaborator],
  );
  if (blocked.length) {
    throw new AppError("Colaborador na lista de restrição não pode ser indicado.", 403);
  }

  const [roles] = await db.execute(
    `SELECT 1 FROM collaborator_role WHERE id_collaborator_role = ? LIMIT 1`,
    [payload.id_collaborator_role],
  );
  if (!roles.length) throw new AppError("Função inválida.", 400);

  if (typeof collaboratorService.linkCollaboratorToCompany === "function") {
    await collaboratorService.linkCollaboratorToCompany(payload.id_collaborator, companyId);
  }

  try {
    await db.execute(
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
  if (!canIndicateForCompany(req, row, companyId)) {
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
  if (link.indication_status !== INDICATION.INDICACAO) {
    throw new AppError("A indicação desta empresa já foi concluída.", 409);
  }
  const [result] = await db.execute(
    `DELETE FROM event_accreditation_collaborator
      WHERE id_event_accreditation_collaborator = ?
        AND id_event_accreditation_company = ?`,
    [linkId, link.id_event_accreditation_company],
  );
  if (!result.affectedRows) throw new AppError("Indicação não encontrada.", 404);
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

  const conn = await db.getConnection();
  let approval = null;
  try {
    await conn.beginTransaction();
    await approvalsService.assertUserCanOpenForSector(conn, row.id_setor, req.user);
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
      idSetor: item.id_setor,
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
  const braceletId = Number(payload.id_bracelet_type);
  const [bracelets] = await db.execute(
    `SELECT * FROM bracelet_type WHERE id_bracelet_type = ? AND ativo = 1 LIMIT 1`,
    [braceletId],
  );
  if (!bracelets.length) throw new AppError("Tipo de pulseira inválido.", 400);
  if (!braceletMatchesKind(bracelets[0].event_kind, row.event_kind)) {
    throw new AppError("Tipo de pulseira não permitido para este tipo de evento.", 400);
  }
  const [allowed] = await db.execute(
    `SELECT 1 FROM event_accreditation_internal_bracelet
      WHERE id_event_accreditation = ? AND id_bracelet_type = ?
      LIMIT 1`,
    [itemId, braceletId],
  );
  if (!allowed.length) {
    throw new AppError("Tipo de pulseira não habilitado para colaboradores internos.", 400);
  }

  const conn = await db.getConnection();
  let approval = null;
  try {
    await conn.beginTransaction();
    try {
      await conn.execute(
        `INSERT INTO event_accreditation_internal
           (id_event_accreditation, id_usuario, id_bracelet_type, id_access_status)
         VALUES (?, ?, ?, ?)`,
        [itemId, req.user.id, braceletId, STATUS_AGUARDANDO_APROVACAO],
      );
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        throw new AppError("Você já está inscrito neste credenciamento.", 409);
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
  if (!(await canDecideItem(req, row))) {
    throw new AppError("Sem permissão para alterar a pulseira deste credenciamento.", 403);
  }

  const braceletId = Number(payload.id_bracelet_type);
  const [bracelets] = await db.execute(
    `SELECT * FROM bracelet_type WHERE id_bracelet_type = ? AND ativo = 1 LIMIT 1`,
    [braceletId],
  );
  if (!bracelets.length) throw new AppError("Tipo de pulseira inválido.", 400);
  if (!braceletMatchesKind(bracelets[0].event_kind, row.event_kind)) {
    throw new AppError("Tipo de pulseira não permitido para este tipo de evento.", 400);
  }

  const ids = uniquePositiveIds(payload.ids || (payload.id != null ? [payload.id] : []));
  if (!ids.length) throw new AppError("Selecione ao menos um colaborador.", 400);
  const placeholders = ids.map(() => "?").join(",");

  if (payload.target === "internal") {
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
    await db.execute(
      `UPDATE event_accreditation_internal SET id_bracelet_type = ?
        WHERE id_event_accreditation = ?
          AND id_event_accreditation_internal IN (${placeholders})`,
      [braceletId, itemId, ...ids],
    );
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
    `SELECT eacol.id_event_accreditation_collaborator, eacol.id_access_status, eacol.id_bracelet_type
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
            eac.id_event_accreditation
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

    const companyIds = [...new Set(rows.map((r) => Number(r.id_event_accreditation_company)))];
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
  return getById(req, itemId);
}

async function notifyCompanies(req, id, payload = {}) {
  const itemId = Number(id);
  const row = await findById(itemId);
  if (!row) throw new AppError("Credenciamento não encontrado.", 404);
  await assertCanRead(req, row);
  const canManage =
    canManageItem(req, row) && hasPermission(req.user, "event_accreditation", "edit");
  if (!canManage) {
    throw new AppError("Sem permissão para notificar empresas deste credenciamento.", 403);
  }

  const [links] = await db.execute(
    `SELECT id_company FROM event_accreditation_company
      WHERE id_event_accreditation = ?
        AND indication_status = ?`,
    [itemId, INDICATION.INDICACAO],
  );
  let companyIds = links.map((r) => Number(r.id_company));
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
  const results = await notifications.sendInviteToCompanies({
    item: mapped,
    companyIds,
    subject: invite?.subject || notifications.buildDefaultInviteSubject(mapped),
    html: invite?.html || notifications.buildDefaultInviteHtml(mapped),
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

async function exportXlsx(req, id) {
  const detail = await getById(req, id);
  if (!detail.cycle_complete) {
    throw new AppError(
      "A exportação só é permitida após o término do ciclo de indicação e aprovação de todas as empresas.",
      409,
    );
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Credenciamento";
  const sheet = workbook.addWorksheet("Colaboradores");
  sheet.columns = [
    { header: "Empresa", key: "empresa", width: 32 },
    { header: "Colaborador", key: "nome", width: 32 },
    { header: "Documento", key: "documento", width: 18 },
    { header: "Função", key: "funcao", width: 22 },
    { header: "Pulseira", key: "pulseira", width: 22 },
    { header: "Status", key: "status", width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };

  if ((detail.internals || []).length) {
    for (const c of detail.internals) {
      sheet.addRow({
        empresa: "Colaboradores internos",
        nome: c.nome_completo,
        documento: c.email,
        funcao: c.departamento || "Interno AD",
        pulseira: c.bracelet_name,
        status: c.access_status_description,
      });
    }
  }

  for (const company of detail.companies) {
    if (!company.collaborators.length) {
      sheet.addRow({
        empresa: company.fancy_name || company.company_name,
        nome: "—",
        documento: "",
        funcao: "",
        pulseira: "",
        status: company.indication_status === INDICATION.NEGADO ? "Sem indicação" : "—",
      });
      continue;
    }
    for (const c of company.collaborators) {
      sheet.addRow({
        empresa: company.fancy_name || company.company_name,
        nome: c.collaborator_name,
        documento: c.collaborator_document,
        funcao: c.role_description,
        pulseira: c.bracelet_name,
        status: c.access_status_description,
      });
    }
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const safe = String(detail.name || "credenciamento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return {
    buffer,
    filename: `credenciamento-eventos-${safe || detail.id_event_accreditation}.xlsx`,
  };
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
  if (existing) return existing;
  const subject = notifications.buildDefaultInviteSubject(item);
  const html = notifications.buildDefaultInviteHtml(item);
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

module.exports = {
  ENTITY_TYPE,
  INDICATION,
  parseListQuery,
  parseListFilters,
  listItems,
  getById,
  createItem,
  updateItem,
  patchStatus,
  addCollaborator,
  removeCollaborator,
  completeCompany,
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
  listBraceletTypes,
  createBraceletType,
  updateBraceletType,
  listLinkableCompanies,
  findById,
  mapBraceletRow,
  uploadCover,
  getInvite,
  saveInvite,
  addInviteFile,
  deleteInviteFile,
  sendInvite,
  dispatchDueInvites,
};
