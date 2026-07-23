const db = require("../../config/db");
const env = require("../../config/env");
const AppError = require("../../utils/AppError");
const { toDateOnly } = require("./event.schema");
const companyService = require("../companies/company.service");
const approvalsService = require("../approvals/approvals.service");
const {
  STATUS_AGUARDANDO_PRODUTORA,
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_APROVADO,
  STATUS_NEGADO,
  STATUS_EXPIRADO,
} = require("../credentials/credentials.schema");
const {
  buildEventScope: buildScopeFromUser,
  getProfileCodigo,
} = require("../../utils/permissions");

const TYPE_PRODUTORA = "Produtora";
const TYPE_EMPRESA_PADRAO = "Empresa Padrão";

function isPartnerScopedRole(role) {
  const codigo = String(role || "").toUpperCase();
  return (
    codigo === "PADRAO" ||
    codigo === "EMPRESA_GESTOR" ||
    codigo === "EMPRESA_SOLICITANTE"
  );
}

function isPartnerScopedUser(req) {
  return isPartnerScopedRole(getProfileCodigo(req?.user));
}

/** Empresa única visível para usuário parceiro (null = sem restrição). */
function resolvePartnerOnlyCompanyId(req, eventRow) {
  if (!isPartnerScopedUser(req)) return null;
  if (userCanManageEventCompanies(req, eventRow)) return null;
  const idCompany =
    req.user?.id_company != null ? Number(req.user.id_company) : null;
  if (!idCompany) {
    throw new AppError("Usuário sem empresa vinculada.", 403);
  }
  return idCompany;
}

/** Tabela prevista no Passo 5 (credenciamento por vínculo dia-empresa). */
const CREDENTIAL_LINK_TABLE = "event_day_company_collaborator";

let cachedProdutoraTypeId = null;
let cachedEmpresaPadraoTypeId = null;

async function getProdutoraTypeId() {
  if (cachedProdutoraTypeId != null) return cachedProdutoraTypeId;
  const [rows] = await db.execute(
    "SELECT id_company_type FROM company_type WHERE description = ? LIMIT 1",
    [TYPE_PRODUTORA],
  );
  if (rows.length === 0) {
    throw new AppError("Tipo de empresa 'Produtora' não configurado.", 500);
  }
  cachedProdutoraTypeId = rows[0].id_company_type;
  return cachedProdutoraTypeId;
}

async function getEmpresaPadraoTypeId() {
  if (cachedEmpresaPadraoTypeId != null) return cachedEmpresaPadraoTypeId;
  const [rows] = await db.execute(
    "SELECT id_company_type FROM company_type WHERE description = ? LIMIT 1",
    [TYPE_EMPRESA_PADRAO],
  );
  if (rows.length === 0) {
    throw new AppError("Tipo de empresa 'Empresa Padrão' não configurado.", 500);
  }
  cachedEmpresaPadraoTypeId = rows[0].id_company_type;
  return cachedEmpresaPadraoTypeId;
}

function buildEventScope(req) {
  return buildScopeFromUser(req.user);
}

function formatDateField(value) {
  if (!value) return value;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function mapEventRow(row) {
  return {
    id_event: row.id_event,
    name: row.name,
    start: formatDateField(row.start),
    end: formatDateField(row.end),
    id_access_status: row.id_access_status != null ? Number(row.id_access_status) : null,
    access_status_description: row.access_status_description || null,
    id_company_responsavel:
      row.id_company_responsavel != null ? Number(row.id_company_responsavel) : null,
    id_setor: row.id_setor != null ? Number(row.id_setor) : null,
    id_solicitante: row.id_solicitante != null ? Number(row.id_solicitante) : null,
    company_responsavel: row.responsavel_company_name
      ? {
          id_company: Number(row.id_company_responsavel),
          company_name: row.responsavel_company_name,
          fancy_name: row.responsavel_fancy_name || null,
          id_company_type: row.responsavel_company_type,
          company_type_description: row.responsavel_type_description || null,
        }
      : null,
    ativo: row.ativo == null ? true : !!Number(row.ativo),
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function assertEventActive(eventRow) {
  if (eventRow && eventRow.ativo != null && !Number(eventRow.ativo)) {
    throw new AppError("Evento desativado. Reative-o para continuar.", 403);
  }
}

async function userCanToggleEventActive(req, idEvent) {
  if (!!req.user?.is_super_admin) return true;
  if (req.user?.id && (await userIsEventSolicitante(req.user.id, idEvent))) {
    return true;
  }
  return false;
}

async function loadEventApprovalSummary(idEvent) {
  const [rows] = await db.execute(
    `SELECT id, status, nivel_atual, niveis_exigidos, id_setor
       FROM aprovacoes
      WHERE tipo_entidade = 'EVENTO' AND id_entidade = ?
      ORDER BY id DESC
      LIMIT 1`,
    [idEvent],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row.id,
    status: row.status,
    nivelAtual: row.nivel_atual,
    niveisExigidos: row.niveis_exigidos,
    idSetor: row.id_setor,
  };
}

function mapCompanyBrief(row) {
  if (!row || row.id_company == null) return null;
  return {
    id_company: row.id_company,
    company_name: row.company_name,
    fancy_name: row.fancy_name || null,
    id_company_type: row.id_company_type,
    company_type_description: row.type_description ?? row.company_type_description,
  };
}

function parseListQuery(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit };
}

function parseListFilters(query) {
  const filters = {};
  if (query.name) filters.name = String(query.name).trim();
  return filters;
}

function buildListJoinAndWhere(scope, filters, userId = null) {
  const conditions = [];
  const params = [];
  let join = "";

  if (scope.mode === "company") {
    join = `
      LEFT JOIN event_day ed ON ed.id_event = e.id_event
      LEFT JOIN event_day_company edc ON edc.id_event_day = ed.id_event_day
    `;
    if (userId != null) {
      conditions.push(
        `(e.id_company_responsavel = ?
          OR edc.id_company = ?
          OR edc.id_producer = ?
          OR EXISTS (
            SELECT 1 FROM aprovacoes a_sol
             WHERE a_sol.tipo_entidade = 'EVENTO'
               AND a_sol.id_entidade = e.id_event
               AND a_sol.id_solicitante = ?
          ))`,
      );
      params.push(scope.companyId, scope.companyId, scope.companyId, userId);
    } else {
      conditions.push(
        "(e.id_company_responsavel = ? OR edc.id_company = ? OR edc.id_producer = ?)",
      );
      params.push(scope.companyId, scope.companyId, scope.companyId);
    }
  } else if (scope.mode === "sector_approver") {
    join = `
      INNER JOIN aprovacoes a_ev
        ON a_ev.tipo_entidade = 'EVENTO' AND a_ev.id_entidade = e.id_event
      INNER JOIN setor_usuarios su_ev
        ON su_ev.id_setor = a_ev.id_setor
       AND su_ev.id_usuario = ?
       AND su_ev.ativo = 1
       AND su_ev.papel IN ('APROVADOR', 'GESTOR')
    `;
    params.push(scope.userId);
  }

  if (filters.name) {
    conditions.push("e.name LIKE ?");
    params.push(`%${filters.name}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { join, where, params };
}

async function getEventSolicitanteId(idEvent, conn = db) {
  const [eventRows] = await conn.execute(
    `SELECT id_solicitante FROM event WHERE id_event = ? LIMIT 1`,
    [idEvent],
  );
  if (eventRows[0]?.id_solicitante != null) {
    return Number(eventRows[0].id_solicitante);
  }
  const [rows] = await conn.execute(
    `SELECT id_solicitante FROM aprovacoes
      WHERE tipo_entidade = 'EVENTO' AND id_entidade = ?
      ORDER BY id ASC
      LIMIT 1`,
    [idEvent],
  );
  return rows[0]?.id_solicitante != null ? Number(rows[0].id_solicitante) : null;
}

async function userIsEventSolicitante(userId, idEvent, conn = db) {
  if (userId == null) return false;
  const solicitanteId = await getEventSolicitanteId(idEvent, conn);
  return solicitanteId != null && Number(solicitanteId) === Number(userId);
}

async function userIsSectorApproverForEvent(userId, idEvent, conn = db) {
  const [rows] = await conn.execute(
    `SELECT 1
       FROM aprovacoes a
       INNER JOIN setor_usuarios su
         ON su.id_setor = a.id_setor
        AND su.id_usuario = ?
        AND su.ativo = 1
        AND su.papel IN ('APROVADOR', 'GESTOR')
      WHERE a.tipo_entidade = 'EVENTO' AND a.id_entidade = ?
      ORDER BY a.id DESC
      LIMIT 1`,
    [userId, idEvent],
  );
  return rows.length > 0;
}

async function assertCanReadEvent(req, idEvent) {
  const scope = buildEventScope(req);
  if (scope.mode === "admin") return;

  if (scope.mode === "sector_approver") {
    const ok = await userIsSectorApproverForEvent(scope.userId, idEvent);
    if (!ok) throw new AppError("Evento não encontrado.", 404);
    return;
  }

  if (req.user?.id && (await userIsEventSolicitante(req.user.id, idEvent))) {
    return;
  }

  const [rows] = await db.execute(
    `SELECT 1
     FROM event e
     LEFT JOIN event_day ed ON ed.id_event = e.id_event
     LEFT JOIN event_day_company edc ON edc.id_event_day = ed.id_event_day
     WHERE e.id_event = ?
       AND (
         e.id_company_responsavel = ?
         OR edc.id_company = ?
         OR edc.id_producer = ?
       )
     LIMIT 1`,
    [idEvent, scope.companyId, scope.companyId, scope.companyId],
  );
  if (rows.length === 0) {
    throw new AppError("Evento não encontrado.", 404);
  }
}

async function listEventDayTypes() {
  const [rows] = await db.execute(
    "SELECT id_event_day_type, description FROM event_day_type ORDER BY description ASC",
  );
  return rows.map((r) => ({
    id_event_day_type: r.id_event_day_type,
    description: r.description,
  }));
}

async function assertEventDayTypeExists(idType, conn = db) {
  const [rows] = await conn.execute(
    "SELECT id_event_day_type FROM event_day_type WHERE id_event_day_type = ? LIMIT 1",
    [idType],
  );
  if (rows.length === 0) {
    throw new AppError("Tipo de dia de evento inválido.", 400);
  }
}

async function findEventById(id) {
  const [rows] = await db.execute(
    `SELECT e.*, ast.description AS access_status_description,
            rc.company_name AS responsavel_company_name,
            rc.fancy_name AS responsavel_fancy_name,
            rc.id_company_type AS responsavel_company_type,
            rct.description AS responsavel_type_description
       FROM event e
       LEFT JOIN access_status ast ON ast.id_access_status = e.id_access_status
       LEFT JOIN company rc ON rc.id_company = e.id_company_responsavel
       LEFT JOIN company_type rct ON rct.id_company_type = rc.id_company_type
      WHERE e.id_event = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findEventDayWithEvent(idEventDay) {
  const [rows] = await db.execute(
    `SELECT ed.*, e.start AS event_start, e.end AS event_end, e.name AS event_name
     FROM event_day ed
     INNER JOIN event e ON e.id_event = ed.id_event
     WHERE ed.id_event_day = ? LIMIT 1`,
    [idEventDay],
  );
  return rows[0] || null;
}

async function findCompanyWithType(idCompany) {
  const row = await companyService.findCompanyById(idCompany);
  if (!row) return null;
  return row;
}

async function isProducerLinkedToDay(idEventDay, idProducer, conn = db) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM event_day_company
     WHERE id_event_day = ? AND id_company = ? LIMIT 1`,
    [idEventDay, idProducer],
  );
  return rows.length > 0;
}

async function tableExists(tableName) {
  const [rows] = await db.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [env.db.name, tableName],
  );
  return rows.length > 0;
}

async function assertNoCredentialedCollaborators(idEventDayCompany) {
  if (!(await tableExists(CREDENTIAL_LINK_TABLE))) return;

  const [rows] = await db.execute(
    `SELECT COUNT(*) AS total FROM ${CREDENTIAL_LINK_TABLE}
     WHERE id_event_day_company = ?`,
    [idEventDayCompany],
  );
  if (rows[0].total > 0) {
    throw new AppError(
      "Não é possível remover o vínculo: existem colaboradores credenciados associados.",
      400,
    );
  }
}

async function loadEventDaysWithCompanies(idEvent, { onlyCompanyId } = {}) {
  const [dayRows] = await db.execute(
    `SELECT ed.id_event_day, ed.id_event, ed.id_type, ed.date,
            edt.id_event_day_type, edt.description AS type_description
     FROM event_day ed
     INNER JOIN event_day_type edt ON edt.id_event_day_type = ed.id_type
     WHERE ed.id_event = ?
     ORDER BY ed.date ASC, ed.id_event_day ASC`,
    [idEvent],
  );

  if (dayRows.length === 0) return [];

  const dayIds = dayRows.map((d) => d.id_event_day);
  const placeholders = dayIds.map(() => "?").join(", ");
  const companyParams = [...dayIds];
  let companyFilter = "";
  if (onlyCompanyId != null) {
    companyFilter = " AND edc.id_company = ?";
    companyParams.push(Number(onlyCompanyId));
  }

  const [companyRows] = await db.execute(
    `SELECT edc.id_event_day_company, edc.id_event_day, edc.id_company, edc.id_producer,
            c.company_name, c.fancy_name, c.id_company_type,
            ct.description AS company_type_description,
            pc.company_name AS producer_company_name,
            pc.fancy_name AS producer_fancy_name,
            pc.id_company_type AS producer_company_type,
            pct.description AS producer_type_description
     FROM event_day_company edc
     INNER JOIN company c ON c.id_company = edc.id_company
     INNER JOIN company_type ct ON ct.id_company_type = c.id_company_type
     LEFT JOIN company pc ON pc.id_company = edc.id_producer
     LEFT JOIN company_type pct ON pct.id_company_type = pc.id_company_type
     WHERE edc.id_event_day IN (${placeholders})${companyFilter}
     ORDER BY c.company_name ASC`,
    companyParams,
  );

  const companiesByDay = new Map();
  for (const row of companyRows) {
    if (!companiesByDay.has(row.id_event_day)) {
      companiesByDay.set(row.id_event_day, []);
    }
    companiesByDay.get(row.id_event_day).push({
      id_event_day_company: row.id_event_day_company,
      company: {
        id_company: row.id_company,
        company_name: row.company_name,
        fancy_name: row.fancy_name || null,
        id_company_type: row.id_company_type,
        company_type_description: row.company_type_description,
      },
      producer: row.id_producer
        ? {
            id_company: row.id_producer,
            company_name: row.producer_company_name,
            fancy_name: row.producer_fancy_name || null,
            id_company_type: row.producer_company_type,
            company_type_description: row.producer_type_description,
          }
        : null,
    });
  }

  return dayRows.map((d) => ({
    id_event_day: d.id_event_day,
    date: formatDateField(d.date),
    type: {
      id_event_day_type: d.id_event_day_type,
      description: d.type_description,
    },
    companies: companiesByDay.get(d.id_event_day) || [],
  }));
}

async function getEventDetailById(id, { onlyCompanyId } = {}) {
  const row = await findEventById(id);
  if (!row) throw new AppError("Evento não encontrado.", 404);
  const days = await loadEventDaysWithCompanies(id, { onlyCompanyId });
  const approval = await loadEventApprovalSummary(id);
  return { ...mapEventRow(row), days, approval };
}

async function listEvents(req, { page, limit, filters }) {
  const scope = buildEventScope(req);
  const offset = (page - 1) * limit;
  const userId = req.user?.id != null ? Number(req.user.id) : null;
  const { join, where, params } = buildListJoinAndWhere(scope, filters, userId);

  const [rows] = await db.execute(
    `SELECT DISTINCT e.id_event, e.name, e.start, e.end, e.id_access_status,
            e.id_company_responsavel, e.ativo, e.criado_em, e.atualizado_em,
            ast.description AS access_status_description,
            rc.company_name AS responsavel_company_name,
            rc.fancy_name AS responsavel_fancy_name,
            rc.id_company_type AS responsavel_company_type,
            rct.description AS responsavel_type_description
     FROM event e
     LEFT JOIN access_status ast ON ast.id_access_status = e.id_access_status
     LEFT JOIN company rc ON rc.id_company = e.id_company_responsavel
     LEFT JOIN company_type rct ON rct.id_company_type = rc.id_company_type
     ${join}
     ${where}
     ORDER BY e.start DESC, e.id_event DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(DISTINCT e.id_event) AS total FROM event e ${join} ${where}`,
    params,
  );

  const events = await Promise.all(
    rows.map(async (row) => {
      const mapped = mapEventRow(row);
      const hasData = await eventHasRegisteredData(mapped.id_event);
      const can_delete =
        !hasData && (await userCanDeleteEvent(req, row, mapped.id_event));
      const can_toggle_active = await userCanToggleEventActive(req, mapped.id_event);
      return {
        ...mapped,
        can_delete,
        can_toggle_active,
        has_registered_data: hasData,
      };
    }),
  );

  return {
    events,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function getEventPortariaPreference(idUsuario, idEvent) {
  const [rows] = await db.execute(
    `SELECT notificar_portaria
       FROM usuario_evento_preferencias
      WHERE id_usuario = ? AND id_event = ?
      LIMIT 1`,
    [idUsuario, idEvent],
  );
  return !!rows[0]?.notificar_portaria;
}

function userCanManageEventCompanies(req, eventRow) {
  return (
    !!req.user?.is_super_admin ||
    (req.user?.id_company != null &&
      Number(req.user.id_company) === Number(eventRow.id_company_responsavel))
  );
}

async function eventHasRegisteredData(idEvent, conn = db) {
  const eventRow = await findEventById(idEvent);
  if (!eventRow) return false;
  const responsavelId =
    eventRow.id_company_responsavel != null
      ? Number(eventRow.id_company_responsavel)
      : null;

  if (await tableExists(CREDENTIAL_LINK_TABLE)) {
    const [credRows] = await conn.execute(
      `SELECT 1
         FROM event_day_company_collaborator edcc
         INNER JOIN event_day_company edc
           ON edc.id_event_day_company = edcc.id_event_day_company
         INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
        WHERE ed.id_event = ?
        LIMIT 1`,
      [idEvent],
    );
    if (credRows.length > 0) return true;
  }

  if (responsavelId != null) {
    const [extraLinks] = await conn.execute(
      `SELECT 1
         FROM event_day_company edc
         INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
        WHERE ed.id_event = ?
          AND NOT (edc.id_company = ? AND edc.id_producer IS NULL)
        LIMIT 1`,
      [idEvent, responsavelId],
    );
    if (extraLinks.length > 0) return true;
  } else {
    const [anyLinks] = await conn.execute(
      `SELECT 1
         FROM event_day_company edc
         INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
        WHERE ed.id_event = ?
        LIMIT 1`,
      [idEvent],
    );
    if (anyLinks.length > 0) return true;
  }

  return false;
}

async function userCanDeleteEvent(req, eventRow, idEvent) {
  if (!!req.user?.is_super_admin) return true;
  if (userCanManageEventCompanies(req, eventRow)) return true;
  if (req.user?.id && (await userIsEventSolicitante(req.user.id, idEvent))) {
    return true;
  }
  return false;
}

async function getEventById(req, id) {
  const row = await findEventById(id);
  if (!row) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, id);
  const onlyCompanyId = resolvePartnerOnlyCompanyId(req, row);
  const detail = await getEventDetailById(id, { onlyCompanyId });
  const notificar_portaria = req.user?.id
    ? await getEventPortariaPreference(req.user.id, id)
    : false;
  const can_approve_credentials =
    !!req.user?.is_super_admin ||
    (req.user?.id ? await userIsSectorApproverForEvent(req.user.id, id) : false);
  const can_manage_companies = userCanManageEventCompanies(req, row);
  const is_solicitante = req.user?.id
    ? await userIsEventSolicitante(req.user.id, id)
    : false;
  const can_change_responsavel = !!req.user?.is_super_admin || is_solicitante;
  const can_toggle_active =
    !!req.user?.is_super_admin || is_solicitante;
  const status = Number(row.id_access_status);
  const can_submit_approval =
    Number(row.ativo) !== 0 &&
    status === STATUS_AGUARDANDO_PRODUTORA &&
    (!!req.user?.is_super_admin || can_manage_companies || is_solicitante) &&
    row.id_setor != null;
  const userCompanyId =
    req.user?.id_company != null ? Number(req.user.id_company) : null;
  const responsavelId =
    row.id_company_responsavel != null ? Number(row.id_company_responsavel) : null;
  let can_notify_complete = false;
  let notified_complete_at = null;
  if (
    userCompanyId &&
    responsavelId != null &&
    userCompanyId !== responsavelId &&
    Number(row.ativo) !== 0
  ) {
    const linked = await isCompanyLinkedToEvent(id, userCompanyId);
    if (linked) {
      const colabCount = await countCompanyCollaboratorsOnEvent(id, userCompanyId);
      can_notify_complete = colabCount > 0;
      notified_complete_at = await getCompanyNotifyCompleteAt(id, userCompanyId);
    }
  }
  const hasData = await eventHasRegisteredData(id);
  const can_delete =
    !hasData && (await userCanDeleteEvent(req, row, id));
  return {
    ...detail,
    notificar_portaria,
    can_approve_credentials,
    can_manage_companies,
    is_solicitante,
    can_change_responsavel,
    can_toggle_active,
    can_submit_approval,
    can_notify_complete,
    notified_complete_at,
    can_delete,
    has_registered_data: hasData,
  };
}

async function updateEventActiveStatus(req, id, ativo) {
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new AppError("Evento inválido.", 400);
  }
  const row = await findEventById(eventId);
  if (!row) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, eventId);

  if (!(await userCanToggleEventActive(req, eventId))) {
    throw new AppError("Somente quem criou o evento pode ativar ou desativar.", 403);
  }

  const nextAtivo = ativo ? 1 : 0;
  const wasAtivo = row.ativo == null ? 1 : Number(row.ativo) ? 1 : 0;
  if (wasAtivo !== nextAtivo) {
    await db.execute("UPDATE event SET ativo = ? WHERE id_event = ?", [
      nextAtivo,
      eventId,
    ]);
  }

  const event = await getEventById(req, eventId);
  return {
    event,
    changes: {
      statusChanged: wasAtivo !== nextAtivo,
      wasActivated: wasAtivo === 0 && nextAtivo === 1,
      wasDeactivated: wasAtivo === 1 && nextAtivo === 0,
    },
  };
}

async function updateEventPreferences(req, id, prefs = {}) {
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new AppError("Evento inválido.", 400);
  }
  const row = await findEventById(eventId);
  if (!row) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, eventId);

  const userId = req.user?.id;
  if (!userId) throw new AppError("Usuário não autenticado.", 401);

  if (prefs.notificar_portaria !== undefined) {
    await db.execute(
      `INSERT INTO usuario_evento_preferencias (id_usuario, id_event, notificar_portaria)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE notificar_portaria = VALUES(notificar_portaria)`,
      [userId, eventId, prefs.notificar_portaria ? 1 : 0],
    );
  }

  return getEventById(req, eventId);
}

async function createEvent(req, data) {
  const start = toDateOnly(data.start);
  const end = toDateOnly(data.end);
  if (start > end) {
    throw new AppError(
      "A data de início deve ser anterior ou igual à data de término.",
      400,
    );
  }

  const days = data.days || [];
  const idSetor = Number(data.id_setor);
  const idCompanyResponsavel = Number(data.id_company_responsavel);
  const idSolicitante = req.user?.id;
  if (!idSolicitante) {
    throw new AppError("Usuário não autenticado.", 401);
  }

  const responsavel = await companyService.findActiveCompanyById(idCompanyResponsavel);
  if (!responsavel) {
    throw new AppError("Empresa responsável não encontrada ou inativa.", 400);
  }
  const produtoraTypeId = await getProdutoraTypeId();
  if (Number(responsavel.id_company_type) !== produtoraTypeId) {
    throw new AppError("A empresa responsável deve ser do tipo Produtora.", 400);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await approvalsService.assertUserCanOpenForSector(conn, idSetor, req.user);

    const [result] = await conn.execute(
      `INSERT INTO event (name, start, end, id_access_status, id_company_responsavel, id_setor, id_solicitante)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        start,
        end,
        STATUS_AGUARDANDO_PRODUTORA,
        idCompanyResponsavel,
        idSetor,
        idSolicitante,
      ],
    );
    const eventId = result.insertId;

    for (const day of days) {
      const dayDate = toDateOnly(day.date);
      if (dayDate < start || dayDate > end) {
        throw new AppError(
          "A data do dia deve estar entre a data de início e a data de término do evento.",
          400,
        );
      }
      await assertEventDayTypeExists(day.id_type, conn);
      const [dayResult] = await conn.execute(
        "INSERT INTO event_day (id_event, id_type, date) VALUES (?, ?, ?)",
        [eventId, day.id_type, dayDate],
      );
      await conn.execute(
        `INSERT INTO event_day_company (id_event_day, id_company, id_producer)
         VALUES (?, ?, NULL)`,
        [dayResult.insertId, idCompanyResponsavel],
      );
    }

    await conn.commit();
    const detail = await getEventDetailById(eventId);
    return {
      ...detail,
      notificar_portaria: false,
      approvalCreated: null,
      notifyResponsavelEmail: true,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function markApproved(conn, idEntidade) {
  await conn.execute(`UPDATE event SET id_access_status = ? WHERE id_event = ?`, [
    STATUS_APROVADO,
    idEntidade,
  ]);
}

async function markRejected(conn, idEntidade) {
  await conn.execute(`UPDATE event SET id_access_status = ? WHERE id_event = ?`, [
    STATUS_NEGADO,
    idEntidade,
  ]);
}

async function markExpired(conn, idEntidade) {
  await conn.execute(`UPDATE event SET id_access_status = ? WHERE id_event = ?`, [
    STATUS_EXPIRADO,
    idEntidade,
  ]);
}

async function resolveEventSetorId(conn, idEvent) {
  const [eventRows] = await conn.execute(
    `SELECT id_setor FROM event WHERE id_event = ? LIMIT 1`,
    [idEvent],
  );
  if (eventRows[0]?.id_setor != null) return Number(eventRows[0].id_setor);

  const [rows] = await conn.execute(
    `SELECT id_setor FROM aprovacoes
      WHERE tipo_entidade = 'EVENTO' AND id_entidade = ?
      ORDER BY CASE status WHEN 'PENDENTE' THEN 0 ELSE 1 END, id DESC
      LIMIT 1`,
    [idEvent],
  );
  if (rows[0]?.id_setor != null) return Number(rows[0].id_setor);

  const [fallback] = await conn.execute(
    `SELECT s.id
       FROM setores s
       INNER JOIN setor_fluxos sf
         ON sf.id_setor = s.id AND sf.tipo_entidade = 'EVENTO' AND sf.ativo = 1
      WHERE s.ativo = 1
      ORDER BY s.id ASC
      LIMIT 1`,
  );
  return fallback[0]?.id != null ? Number(fallback[0].id) : null;
}

/**
 * Reabre aprovação do evento após alteração relevante (ex.: período).
 */
async function reopenEventForApproval(conn, eventRow, { force = false, idSetor = null, idSolicitante = null } = {}) {
  const idEvent = eventRow.id_event || eventRow.id;
  const status = Number(eventRow.id_access_status);
  const needsReopen =
    force ||
    status === STATUS_APROVADO ||
    status === STATUS_NEGADO ||
    status === STATUS_EXPIRADO;

  const [pending] = await conn.execute(
    `SELECT id FROM aprovacoes
      WHERE tipo_entidade = 'EVENTO' AND id_entidade = ? AND status = 'PENDENTE'
      LIMIT 1`,
    [idEvent],
  );

  if (pending.length) {
    if (needsReopen) {
      await conn.execute(`UPDATE event SET id_access_status = ? WHERE id_event = ?`, [
        STATUS_AGUARDANDO_APROVACAO,
        idEvent,
      ]);
      return { reopened: true, created: false, idAprovacao: pending[0].id };
    }
    return { reopened: false, created: false, idAprovacao: pending[0].id };
  }

  if (!needsReopen && status !== STATUS_AGUARDANDO_APROVACAO) {
    return { reopened: false, created: false, idAprovacao: null };
  }

  await conn.execute(`UPDATE event SET id_access_status = ? WHERE id_event = ?`, [
    STATUS_AGUARDANDO_APROVACAO,
    idEvent,
  ]);

  const resolvedSetor = idSetor != null ? Number(idSetor) : await resolveEventSetorId(conn, idEvent);
  if (!resolvedSetor) {
    throw new AppError(
      "Não foi possível reabrir a aprovação: setor aprovador não encontrado.",
      422,
    );
  }

  let resolvedSolicitante = idSolicitante;
  if (!resolvedSolicitante && eventRow.id_solicitante != null) {
    resolvedSolicitante = Number(eventRow.id_solicitante);
  }
  if (!resolvedSolicitante) {
    const [solRows] = await conn.execute(
      `SELECT id_solicitante FROM aprovacoes
        WHERE tipo_entidade = 'EVENTO' AND id_entidade = ?
        ORDER BY id ASC
        LIMIT 1`,
      [idEvent],
    );
    resolvedSolicitante = solRows[0]?.id_solicitante || null;
  }
  if (!resolvedSolicitante) {
    throw new AppError(
      "Não foi possível reabrir a aprovação: solicitante não encontrado.",
      422,
    );
  }

  const approval = await approvalsService.createApprovalFor(conn, {
    tipoEntidade: "EVENTO",
    idEntidade: idEvent,
    idSetor: resolvedSetor,
    idSolicitante: resolvedSolicitante,
  });

  return { reopened: true, created: true, idAprovacao: approval.id };
}

async function updateEventPeriod(req, id, data) {
  const eventRow = await findEventById(id);
  if (!eventRow) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, id);
  assertEventActive(eventRow);

  if (!userCanManageEventCompanies(req, eventRow)) {
    throw new AppError("Sem permissão para ajustar o período deste evento.", 403);
  }

  const start = toDateOnly(data.start);
  const end = toDateOnly(data.end);
  if (start > end) {
    throw new AppError(
      "A data de início deve ser anterior ou igual à data de término.",
      400,
    );
  }

  const [dayRows] = await db.execute(
    `SELECT id_event_day, date FROM event_day WHERE id_event = ? ORDER BY date ASC`,
    [id],
  );
  for (const day of dayRows) {
    const dayDate = formatDateField(day.date);
    if (dayDate < start || dayDate > end) {
      throw new AppError(
        `O dia ${dayDate} fica fora do novo período. Ajuste ou remova os dias fora do intervalo antes de salvar.`,
        422,
      );
    }
  }

  const previousStart = formatDateField(eventRow.start);
  const previousEnd = formatDateField(eventRow.end);
  const datesChanged = previousStart !== start || previousEnd !== end;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`UPDATE event SET start = ?, end = ? WHERE id_event = ?`, [
      start,
      end,
      id,
    ]);

    let reopenResult = { reopened: false, created: false, idAprovacao: null };
    if (datesChanged) {
      const currentStatus = Number(eventRow.id_access_status);
      reopenResult = await reopenEventForApproval(conn, eventRow, {
        force:
          currentStatus === STATUS_APROVADO ||
          currentStatus === STATUS_NEGADO ||
          currentStatus === STATUS_EXPIRADO,
        idSolicitante: req.user?.id || null,
      });
    }

    await conn.commit();
    const detail = await getEventDetailById(id);
    const notificar_portaria = req.user?.id
      ? await getEventPortariaPreference(req.user.id, id)
      : false;
    return {
      ...detail,
      notificar_portaria,
      periodChanged: datesChanged,
      approvalReopened: !!reopenResult.reopened,
      id_aprovacao: reopenResult.idAprovacao || detail.approval?.id || null,
      aprovacao_status: detail.approval?.status || null,
      id_setor: detail.approval?.idSetor || detail.id_setor || null,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function migrateCredentialsBetweenLinks(conn, fromLinkId, toLinkId) {
  if (!(await tableExists(CREDENTIAL_LINK_TABLE))) return;
  if (Number(fromLinkId) === Number(toLinkId)) return;

  await conn.execute(
    `UPDATE ${CREDENTIAL_LINK_TABLE}
        SET id_event_day_company = ?
      WHERE id_event_day_company = ?`,
    [toLinkId, fromLinkId],
  );
}

async function migrateResponsavelLinksForDay(conn, idEventDay, oldId, newId) {
  await conn.execute(
    `UPDATE event_day_company
        SET id_producer = ?
      WHERE id_event_day = ? AND id_producer = ?`,
    [newId, idEventDay, oldId],
  );

  const [oldLinks] = await conn.execute(
    `SELECT id_event_day_company
       FROM event_day_company
      WHERE id_event_day = ? AND id_company = ? AND id_producer IS NULL
      LIMIT 1`,
    [idEventDay, oldId],
  );
  const [newLinks] = await conn.execute(
    `SELECT id_event_day_company
       FROM event_day_company
      WHERE id_event_day = ? AND id_company = ?
      LIMIT 1`,
    [idEventDay, newId],
  );

  const oldLinkId = oldLinks[0]?.id_event_day_company || null;
  const newLinkId = newLinks[0]?.id_event_day_company || null;

  if (oldLinkId && !newLinkId) {
    await conn.execute(
      `UPDATE event_day_company SET id_company = ? WHERE id_event_day_company = ?`,
      [newId, oldLinkId],
    );
    return;
  }

  if (oldLinkId && newLinkId && Number(oldLinkId) !== Number(newLinkId)) {
    await migrateCredentialsBetweenLinks(conn, oldLinkId, newLinkId);
    await conn.execute(
      `UPDATE event_day_company SET id_producer = NULL WHERE id_event_day_company = ?`,
      [newLinkId],
    );
    await conn.execute(
      `DELETE FROM event_day_company WHERE id_event_day_company = ?`,
      [oldLinkId],
    );
    return;
  }

  if (!oldLinkId && !newLinkId) {
    await conn.execute(
      `INSERT INTO event_day_company (id_event_day, id_company, id_producer)
       VALUES (?, ?, NULL)`,
      [idEventDay, newId],
    );
  }
}

async function updateEventResponsavel(req, id, idCompanyResponsavel) {
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new AppError("Evento inválido.", 400);
  }

  const eventRow = await findEventById(eventId);
  if (!eventRow) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, eventId);
  assertEventActive(eventRow);

  const isSolicitante = req.user?.id
    ? await userIsEventSolicitante(req.user.id, eventId)
    : false;
  const canChange = !!req.user?.is_super_admin || isSolicitante;
  if (!canChange) {
    throw new AppError("Sem permissão para trocar a empresa responsável.", 403);
  }

  const newId = Number(idCompanyResponsavel);
  if (!Number.isInteger(newId) || newId <= 0) {
    throw new AppError("Empresa responsável inválida.", 400);
  }

  const oldId =
    eventRow.id_company_responsavel != null
      ? Number(eventRow.id_company_responsavel)
      : null;

  if (oldId === newId) {
    return getEventById(req, eventId);
  }

  const responsavel = await companyService.findActiveCompanyById(newId);
  if (!responsavel) {
    throw new AppError("Empresa responsável não encontrada ou inativa.", 400);
  }
  const produtoraTypeId = await getProdutoraTypeId();
  if (Number(responsavel.id_company_type) !== produtoraTypeId) {
    throw new AppError("A empresa responsável deve ser do tipo Produtora.", 400);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE event SET id_company_responsavel = ? WHERE id_event = ?`,
      [newId, eventId],
    );

    if (oldId != null) {
      const [dayRows] = await conn.execute(
        `SELECT id_event_day FROM event_day WHERE id_event = ?`,
        [eventId],
      );
      for (const day of dayRows) {
        await migrateResponsavelLinksForDay(conn, day.id_event_day, oldId, newId);
      }
    } else {
      const [dayRows] = await conn.execute(
        `SELECT id_event_day FROM event_day WHERE id_event = ?`,
        [eventId],
      );
      for (const day of dayRows) {
        const [existing] = await conn.execute(
          `SELECT 1 FROM event_day_company
            WHERE id_event_day = ? AND id_company = ? LIMIT 1`,
          [day.id_event_day, newId],
        );
        if (!existing.length) {
          await conn.execute(
            `INSERT INTO event_day_company (id_event_day, id_company, id_producer)
             VALUES (?, ?, NULL)`,
            [day.id_event_day, newId],
          );
        }
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      throw new AppError(
        "Não foi possível trocar a responsável: conflito de vínculo no dia.",
        409,
      );
    }
    throw err;
  } finally {
    conn.release();
  }

  return getEventById(req, eventId);
}

async function addCompanyToEventDay(req, idEventDay, payload) {
  const eventDay = await findEventDayWithEvent(idEventDay);
  if (!eventDay) throw new AppError("Dia de evento não encontrado.", 404);

  const eventRow = await findEventById(eventDay.id_event);
  if (!eventRow) throw new AppError("Evento não encontrado.", 404);

  const company = await companyService.findActiveCompanyById(payload.id_company);
  if (!company) {
    throw new AppError("Empresa não encontrada ou inativa.", 400);
  }

  const produtoraTypeId = await getProdutoraTypeId();
  const padraoTypeId = await getEmpresaPadraoTypeId();
  const isAdmin = !!req.user?.is_super_admin;
  const userCompanyId =
    req.user?.id_company != null ? Number(req.user.id_company) : null;
  const responsavelId =
    eventRow.id_company_responsavel != null
      ? Number(eventRow.id_company_responsavel)
      : null;
  const isResponsavel = userCompanyId != null && userCompanyId === responsavelId;

  if (!isAdmin && !isResponsavel) {
    throw new AppError("Sem permissão para vincular empresas a este evento.", 403);
  }

  let idProducer = null;

  if (company.id_company_type === produtoraTypeId) {
    if (!isAdmin) {
      throw new AppError(
        "Apenas administradores podem vincular outra Produtora ao dia.",
        403,
      );
    }
    if (payload.id_producer != null) {
      throw new AppError(
        "Empresa do tipo Produtora não deve informar produtora responsável.",
        400,
      );
    }
    idProducer = null;
  } else if (company.id_company_type === padraoTypeId) {
    const resolvedProducer =
      payload.id_producer != null
        ? Number(payload.id_producer)
        : responsavelId;

    if (resolvedProducer == null) {
      throw new AppError(
        "Empresa do tipo Empresa Padrão deve informar a produtora responsável (id_producer).",
        400,
      );
    }

    if (!isAdmin && resolvedProducer !== responsavelId) {
      throw new AppError(
        "A Empresa Padrão deve ser vinculada à empresa responsável do evento.",
        403,
      );
    }

    const producer = await companyService.findActiveCompanyById(resolvedProducer);
    if (!producer) {
      throw new AppError("Produtora responsável não encontrada ou inativa.", 400);
    }
    if (producer.id_company_type !== produtoraTypeId) {
      throw new AppError(
        "A produtora responsável deve ser uma empresa do tipo Produtora.",
        400,
      );
    }

    const linked = await isProducerLinkedToDay(idEventDay, resolvedProducer);
    if (!linked) {
      throw new AppError(
        "Produtora responsável não está vinculada a este dia.",
        400,
      );
    }

    idProducer = resolvedProducer;
  } else {
    throw new AppError("Tipo de empresa não permitido na matriz de eventos.", 400);
  }

  try {
    const [result] = await db.execute(
      `INSERT INTO event_day_company (id_event_day, id_company, id_producer)
       VALUES (?, ?, ?)`,
      [idEventDay, payload.id_company, idProducer],
    );

    const [rows] = await db.execute(
      `SELECT edc.*, c.company_name, c.fancy_name, c.id_company_type,
              ct.description AS company_type_description
       FROM event_day_company edc
       INNER JOIN company c ON c.id_company = edc.id_company
       INNER JOIN company_type ct ON ct.id_company_type = c.id_company_type
       WHERE edc.id_event_day_company = ? LIMIT 1`,
      [result.insertId],
    );

    const row = rows[0];
    let producer = null;
    if (row.id_producer) {
      const prodRow = await findCompanyWithType(row.id_producer);
      producer = mapCompanyBrief(prodRow);
    }

    return {
      id_event_day_company: row.id_event_day_company,
      id_event_day: row.id_event_day,
      id_company: row.id_company,
      id_producer: row.id_producer,
      company: mapCompanyBrief(row),
      producer,
    };
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      throw new AppError("Empresa já vinculada a este dia de evento.", 409);
    }
    throw err;
  }
}

async function listProducerCompanies() {
  const produtoraTypeId = await getProdutoraTypeId();
  const [rows] = await db.execute(
    `SELECT c.id_company, c.company_name, c.fancy_name, c.id_company_type,
            ct.description AS company_type_description
       FROM company c
       INNER JOIN company_type ct ON ct.id_company_type = c.id_company_type
      WHERE c.id_company_type = ? AND c.status = 1
      ORDER BY c.company_name ASC`,
    [produtoraTypeId],
  );
  return rows.map((r) => ({
    id_company: r.id_company,
    company_name: r.company_name,
    fancy_name: r.fancy_name || null,
    id_company_type: r.id_company_type,
    company_type_description: r.company_type_description,
  }));
}

async function listPadraoCompaniesForEvent(req, idEvent) {
  const eventRow = await findEventById(idEvent);
  if (!eventRow) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, idEvent);

  const isAdmin = !!req.user?.is_super_admin;
  const userCompanyId =
    req.user?.id_company != null ? Number(req.user.id_company) : null;
  const responsavelId =
    eventRow.id_company_responsavel != null
      ? Number(eventRow.id_company_responsavel)
      : null;
  const isResponsavel = userCompanyId != null && userCompanyId === responsavelId;

  if (!isAdmin && !isResponsavel) {
    throw new AppError("Sem permissão para listar empresas vinculáveis.", 403);
  }

  const padraoTypeId = await getEmpresaPadraoTypeId();
  const [rows] = await db.execute(
    `SELECT c.id_company, c.company_name, c.fancy_name, c.id_company_type,
            ct.description AS company_type_description
       FROM company c
       INNER JOIN company_type ct ON ct.id_company_type = c.id_company_type
      WHERE c.id_company_type = ? AND c.status = 1
      ORDER BY c.company_name ASC`,
    [padraoTypeId],
  );
  return {
    id_company_responsavel: responsavelId,
    companies: rows.map((r) => ({
      id_company: r.id_company,
      company_name: r.company_name,
      fancy_name: r.fancy_name || null,
      id_company_type: r.id_company_type,
      company_type_description: r.company_type_description,
    })),
  };
}

async function removeCompanyFromEventDay(req, idEventDayCompany) {
  const link = await findEventDayCompanyById(idEventDayCompany);
  if (!link) {
    throw new AppError("Vínculo empresa-dia não encontrado.", 404);
  }

  const eventRow = await findEventById(link.id_event);
  const isAdmin = !!req.user?.is_super_admin;
  const userCompanyId =
    req.user?.id_company != null ? Number(req.user.id_company) : null;
  const responsavelId =
    eventRow?.id_company_responsavel != null
      ? Number(eventRow.id_company_responsavel)
      : null;
  const isResponsavel = userCompanyId != null && userCompanyId === responsavelId;

  if (!isAdmin) {
    if (!isResponsavel) {
      throw new AppError("Sem permissão para remover vínculo.", 403);
    }
    if (Number(link.id_company) === responsavelId) {
      throw new AppError(
        "Não é possível remover a empresa responsável do evento.",
        400,
      );
    }
    if (link.id_producer == null || Number(link.id_producer) !== responsavelId) {
      throw new AppError("Sem permissão para remover este vínculo.", 403);
    }
  }

  await assertNoCredentialedCollaborators(idEventDayCompany);

  await db.execute(
    "DELETE FROM event_day_company WHERE id_event_day_company = ?",
    [idEventDayCompany],
  );

  return {
    id_event_day_company: link.id_event_day_company,
    id_event_day: link.id_event_day,
    id_company: link.id_company,
    id_producer: link.id_producer,
  };
}

async function findEventDayCompanyById(id) {
  const [rows] = await db.execute(
    `SELECT edc.*, ed.id_event
     FROM event_day_company edc
     INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
     WHERE edc.id_event_day_company = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function deleteEvent(req, id) {
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new AppError("Evento inválido.", 400);
  }

  const eventRow = await findEventById(eventId);
  if (!eventRow) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, eventId);

  if (!(await userCanDeleteEvent(req, eventRow, eventId))) {
    throw new AppError("Sem permissão para excluir este evento.", 403);
  }

  if (await eventHasRegisteredData(eventId)) {
    throw new AppError(
      "Não é possível excluir: o evento possui empresas ou colaboradores cadastrados.",
      409,
    );
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [aprovacoes] = await conn.execute(
      `SELECT id FROM aprovacoes
        WHERE tipo_entidade = 'EVENTO' AND id_entidade = ?`,
      [eventId],
    );
    if (aprovacoes.length > 0) {
      const ids = aprovacoes.map((a) => a.id);
      const placeholders = ids.map(() => "?").join(", ");
      await conn.execute(
        `DELETE FROM aprovacao_decisoes WHERE id_aprovacao IN (${placeholders})`,
        ids,
      );
      await conn.execute(
        `DELETE FROM aprovacoes WHERE id IN (${placeholders})`,
        ids,
      );
    }

    await conn.execute(`DELETE FROM event WHERE id_event = ?`, [eventId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return {
    deleted: true,
    id_event: eventId,
    name: eventRow.name,
  };
}

async function syncCompanyPhases(req, idEvent, idCompany, phases) {
  const eventId = Number(idEvent);
  const companyId = Number(idCompany);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new AppError("Evento inválido.", 400);
  }
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new AppError("Empresa inválida.", 400);
  }

  const phaseNames = [...new Set((phases || []).map((p) => String(p || "").trim()).filter(Boolean))];
  if (!phaseNames.length) {
    throw new AppError("Selecione ao menos uma fase.", 400);
  }

  const eventRow = await findEventById(eventId);
  if (!eventRow) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, eventId);
  assertEventActive(eventRow);

  if (!userCanManageEventCompanies(req, eventRow)) {
    throw new AppError("Sem permissão para vincular empresas a este evento.", 403);
  }

  const responsavelId =
    eventRow.id_company_responsavel != null
      ? Number(eventRow.id_company_responsavel)
      : null;
  if (responsavelId != null && companyId === responsavelId) {
    throw new AppError(
      "A empresa responsável não pode ter as fases alteradas por este fluxo.",
      400,
    );
  }

  const company = await companyService.findActiveCompanyById(companyId);
  if (!company) {
    throw new AppError("Empresa não encontrada ou inativa.", 400);
  }
  const padraoTypeId = await getEmpresaPadraoTypeId();
  if (Number(company.id_company_type) !== padraoTypeId) {
    throw new AppError("Apenas Empresa Padrão pode ser vinculada como parceira.", 400);
  }
  if (responsavelId == null) {
    throw new AppError("Evento sem empresa responsável definida.", 400);
  }

  const [dayRows] = await db.execute(
    `SELECT ed.id_event_day, ed.id_type, edt.description AS type_description
       FROM event_day ed
       INNER JOIN event_day_type edt ON edt.id_event_day_type = ed.id_type
      WHERE ed.id_event = ?
      ORDER BY ed.date ASC`,
    [eventId],
  );

  const availablePhases = [...new Set(dayRows.map((d) => d.type_description))];
  for (const phase of phaseNames) {
    if (!availablePhases.includes(phase)) {
      throw new AppError(`Fase "${phase}" não existe neste evento.`, 400);
    }
  }

  const targetDayIds = new Set(
    dayRows
      .filter((d) => phaseNames.includes(d.type_description))
      .map((d) => Number(d.id_event_day)),
  );

  const [existingLinks] = await db.execute(
    `SELECT edc.id_event_day_company, edc.id_event_day
       FROM event_day_company edc
       INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
      WHERE ed.id_event = ? AND edc.id_company = ?`,
    [eventId, companyId],
  );

  const wasNewLink = existingLinks.length === 0;
  let insertedLinks = 0;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const link of existingLinks) {
      const dayId = Number(link.id_event_day);
      if (targetDayIds.has(dayId)) continue;

      if (await tableExists(CREDENTIAL_LINK_TABLE)) {
        const [credRows] = await conn.execute(
          `SELECT COUNT(*) AS total FROM ${CREDENTIAL_LINK_TABLE}
            WHERE id_event_day_company = ?`,
          [link.id_event_day_company],
        );
        if (Number(credRows[0]?.total || 0) > 0) {
          throw new AppError(
            "Não é possível remover a fase: existem credenciais vinculadas.",
            400,
          );
        }
      }
      await conn.execute(
        `DELETE FROM event_day_company WHERE id_event_day_company = ?`,
        [link.id_event_day_company],
      );
    }

    const existingDayIds = new Set(existingLinks.map((l) => Number(l.id_event_day)));
    for (const dayId of targetDayIds) {
      if (existingDayIds.has(dayId)) continue;
      await conn.execute(
        `INSERT INTO event_day_company (id_event_day, id_company, id_producer)
         VALUES (?, ?, ?)`,
        [dayId, companyId, responsavelId],
      );
      insertedLinks += 1;
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      throw new AppError("Empresa já vinculada a um dos dias selecionados.", 409);
    }
    throw err;
  } finally {
    conn.release();
  }

  const detail = await getEventById(req, eventId);
  return {
    ...detail,
    partnerNewlyLinked: wasNewLink && insertedLinks > 0,
    partnerCompanyName: company.company_name || company.fancy_name || null,
  };
}

async function countCompanyCollaboratorsOnEvent(idEvent, idCompany, conn = db) {
  if (!(await tableExists(CREDENTIAL_LINK_TABLE))) return 0;
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS total
       FROM ${CREDENTIAL_LINK_TABLE} edcc
       INNER JOIN event_day_company edc
         ON edc.id_event_day_company = edcc.id_event_day_company
       INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
      WHERE ed.id_event = ? AND edc.id_company = ?`,
    [idEvent, idCompany],
  );
  return Number(rows[0]?.total || 0);
}

async function isCompanyLinkedToEvent(idEvent, idCompany, conn = db) {
  const [rows] = await conn.execute(
    `SELECT 1
       FROM event_day_company edc
       INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
      WHERE ed.id_event = ? AND edc.id_company = ?
      LIMIT 1`,
    [idEvent, idCompany],
  );
  return rows.length > 0;
}

async function getCompanyNotifyCompleteAt(idEvent, idCompany) {
  if (!(await tableExists("event_company_notify"))) return null;
  const [rows] = await db.execute(
    `SELECT notified_complete_at
       FROM event_company_notify
      WHERE id_event = ? AND id_company = ?
      LIMIT 1`,
    [idEvent, idCompany],
  );
  return rows[0]?.notified_complete_at || null;
}

async function submitEventApproval(req, id) {
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new AppError("Evento inválido.", 400);
  }

  const eventRow = await findEventById(eventId);
  if (!eventRow) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, eventId);
  assertEventActive(eventRow);

  const canSubmit =
    !!req.user?.is_super_admin ||
    userCanManageEventCompanies(req, eventRow) ||
    (req.user?.id ? await userIsEventSolicitante(req.user.id, eventId) : false);
  if (!canSubmit) {
    throw new AppError("Sem permissão para notificar o setor deste evento.", 403);
  }

  const status = Number(eventRow.id_access_status);
  if (status !== STATUS_AGUARDANDO_PRODUTORA) {
    if (status === STATUS_AGUARDANDO_APROVACAO) {
      throw new AppError("Este evento já está aguardando aprovação.", 409);
    }
    if (status === STATUS_APROVADO) {
      throw new AppError("Este evento já está aprovado.", 409);
    }
    throw new AppError(
      "Só é possível notificar o setor enquanto o evento estiver aguardando a produtora.",
      409,
    );
  }

  const idSetor = eventRow.id_setor != null ? Number(eventRow.id_setor) : null;
  const idSolicitante =
    eventRow.id_solicitante != null
      ? Number(eventRow.id_solicitante)
      : req.user?.id || null;
  if (!idSetor) {
    throw new AppError("Evento sem setor aprovador definido.", 422);
  }
  if (!idSolicitante) {
    throw new AppError("Evento sem solicitante definido.", 422);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await approvalsService.assertUserCanOpenForSector(conn, idSetor, req.user);

    const [pending] = await conn.execute(
      `SELECT id FROM aprovacoes
        WHERE tipo_entidade = 'EVENTO' AND id_entidade = ? AND status = 'PENDENTE'
        LIMIT 1`,
      [eventId],
    );
    if (pending.length) {
      throw new AppError("Este evento já possui aprovação pendente.", 409);
    }

    await conn.execute(`UPDATE event SET id_access_status = ? WHERE id_event = ?`, [
      STATUS_AGUARDANDO_APROVACAO,
      eventId,
    ]);

    const approval = await approvalsService.createApprovalFor(conn, {
      tipoEntidade: "EVENTO",
      idEntidade: eventId,
      idSetor,
      idSolicitante,
    });

    await conn.commit();
    const detail = await getEventById(req, eventId);
    return {
      ...detail,
      approvalCreated: approval,
      id_setor: idSetor,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function notifyCompanyComplete(req, idEvent, idCompany) {
  const eventId = Number(idEvent);
  const companyId = Number(idCompany);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new AppError("Evento inválido.", 400);
  }
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new AppError("Empresa inválida.", 400);
  }

  const eventRow = await findEventById(eventId);
  if (!eventRow) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, eventId);
  assertEventActive(eventRow);

  const responsavelId =
    eventRow.id_company_responsavel != null
      ? Number(eventRow.id_company_responsavel)
      : null;
  if (responsavelId == null) {
    throw new AppError("Evento sem empresa responsável definida.", 400);
  }
  if (companyId === responsavelId) {
    throw new AppError("A empresa responsável não usa Notificar término.", 400);
  }

  const isAdmin = !!req.user?.is_super_admin;
  const userCompanyId =
    req.user?.id_company != null ? Number(req.user.id_company) : null;
  if (!isAdmin && userCompanyId !== companyId) {
    throw new AppError("Sem permissão para notificar término desta empresa.", 403);
  }

  if (!(await isCompanyLinkedToEvent(eventId, companyId))) {
    throw new AppError("Empresa não está vinculada a este evento.", 400);
  }

  const collaboratorCount = await countCompanyCollaboratorsOnEvent(eventId, companyId);
  if (collaboratorCount < 1) {
    throw new AppError(
      "Cadastre ao menos um colaborador antes de notificar o término.",
      400,
    );
  }

  const company = await companyService.findCompanyById(companyId);
  const partnerName = company?.company_name || company?.fancy_name || "Empresa parceira";

  if (await tableExists("event_company_notify")) {
    await db.execute(
      `INSERT INTO event_company_notify (id_event, id_company, notified_complete_at, id_usuario)
       VALUES (?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE notified_complete_at = NOW(), id_usuario = VALUES(id_usuario)`,
      [eventId, companyId, req.user?.id || null],
    );
  }

  const detail = await getEventById(req, eventId);
  return {
    ...detail,
    notifyCompleteEmail: {
      idCompanyResponsavel: responsavelId,
      partnerName,
    },
  };
}

async function removeCompanyFromEvent(req, idEvent, idCompany) {
  const eventId = Number(idEvent);
  const companyId = Number(idCompany);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new AppError("Evento inválido.", 400);
  }
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new AppError("Empresa inválida.", 400);
  }

  const eventRow = await findEventById(eventId);
  if (!eventRow) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, eventId);
  assertEventActive(eventRow);

  if (!userCanManageEventCompanies(req, eventRow)) {
    throw new AppError("Sem permissão para remover empresas deste evento.", 403);
  }

  const responsavelId =
    eventRow.id_company_responsavel != null
      ? Number(eventRow.id_company_responsavel)
      : null;
  if (responsavelId != null && companyId === responsavelId) {
    throw new AppError(
      "Não é possível remover a empresa responsável do evento.",
      400,
    );
  }

  const [links] = await db.execute(
    `SELECT edc.id_event_day_company
       FROM event_day_company edc
       INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
      WHERE ed.id_event = ? AND edc.id_company = ?`,
    [eventId, companyId],
  );

  if (links.length === 0) {
    throw new AppError("Empresa não vinculada a este evento.", 404);
  }

  const linkIds = links.map((l) => Number(l.id_event_day_company));
  const placeholders = linkIds.map(() => "?").join(", ");

  if (await tableExists(CREDENTIAL_LINK_TABLE)) {
    const [credRows] = await db.execute(
      `SELECT COUNT(*) AS total FROM ${CREDENTIAL_LINK_TABLE}
        WHERE id_event_day_company IN (${placeholders})`,
      linkIds,
    );
    if (Number(credRows[0]?.total || 0) > 0) {
      throw new AppError(
        "Não é possível remover o vínculo: existem colaboradores credenciados associados.",
        400,
      );
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (await tableExists("event_day_company_vehicle")) {
      await conn.execute(
        `DELETE FROM event_day_company_vehicle
          WHERE id_event_day_company IN (${placeholders})`,
        linkIds,
      );
    }

    await conn.execute(
      `DELETE FROM event_day_company
        WHERE id_event_day_company IN (${placeholders})`,
      linkIds,
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return {
    id_event: eventId,
    id_company: companyId,
    removed_links: linkIds,
  };
}

async function listCompanyVehicles(req, idEvent, idCompany) {
  return require("./event-company-vehicle.service").listCompanyVehicles(
    req,
    idEvent,
    idCompany,
  );
}

async function addCompanyVehicle(req, idEvent, idCompany, idVehicle) {
  return require("./event-company-vehicle.service").addCompanyVehicle(
    req,
    idEvent,
    idCompany,
    idVehicle,
  );
}

async function removeCompanyVehicle(req, idEvent, idCompany, idVehicle) {
  return require("./event-company-vehicle.service").removeCompanyVehicle(
    req,
    idEvent,
    idCompany,
    idVehicle,
  );
}

async function listEventVehicleCounts(req, idEvent) {
  const row = await findEventById(idEvent);
  if (!row) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, idEvent);
  const onlyCompanyId = resolvePartnerOnlyCompanyId(req, row);
  return require("./event-company-vehicle.service").listEventVehicleCounts(
    idEvent,
    { onlyCompanyId },
  );
}

async function getCompanyBulkImportTemplate() {
  return require("../patrimonial/service-access-bulk-import").buildUnifiedTemplate();
}

async function previewCompanyBulkImport(req, idEvent, idCompany, file) {
  const vehicleSvc = require("./event-company-vehicle.service");
  const links = await vehicleSvc.assertCanManageCompanyVehicles(req, idEvent, idCompany);
  const event = await getEventById(req, idEvent);
  const companyName =
    links[0]?.company_name ||
    links[0]?.fancy_name ||
    null;
  const flow = require("./event-company-bulk-import.flow");
  return flow.previewUnifiedBulkImport({
    eventId: Number(idEvent),
    companyId: Number(idCompany),
    eventName: event?.name || `Evento #${idEvent}`,
    companyName,
    file,
    userId: req.user?.id || null,
  });
}

async function confirmCompanyBulkImport(req, idEvent, idCompany, body) {
  const vehicleSvc = require("./event-company-vehicle.service");
  const links = await vehicleSvc.assertCanManageCompanyVehicles(req, idEvent, idCompany);
  const previewToken = body.previewToken || body.previewId;
  if (!previewToken) {
    throw new AppError("previewToken é obrigatório.", 400);
  }
  const flow = require("./event-company-bulk-import.flow");
  return flow.confirmUnifiedBulkImport({
    eventId: Number(idEvent),
    companyId: Number(idCompany),
    links,
    previewToken,
    decisoes: body.decisoes || {},
    userId: req.user?.id || null,
    req,
  });
}

module.exports = {
  parseListQuery,
  parseListFilters,
  listEventDayTypes,
  listEvents,
  getEventById,
  updateEventPreferences,
  updateEventActiveStatus,
  createEvent,
  updateEventPeriod,
  updateEventResponsavel,
  deleteEvent,
  assertEventActive,
  syncCompanyPhases,
  removeCompanyFromEvent,
  reopenEventForApproval,
  submitEventApproval,
  notifyCompanyComplete,
  addCompanyToEventDay,
  removeCompanyFromEventDay,
  listProducerCompanies,
  listPadraoCompaniesForEvent,
  userIsSectorApproverForEvent,
  getEventSolicitanteId,
  markApproved,
  markRejected,
  markExpired,
  listCompanyVehicles,
  addCompanyVehicle,
  removeCompanyVehicle,
  listEventVehicleCounts,
  getCompanyBulkImportTemplate,
  previewCompanyBulkImport,
  confirmCompanyBulkImport,
};
