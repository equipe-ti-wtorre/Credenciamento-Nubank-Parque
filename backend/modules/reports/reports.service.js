const ExcelJS = require("exceljs");
const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const {
  STATUS_AGUARDANDO_PRODUTORA,
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_APROVADO,
  STATUS_NEGADO,
  STATUS_EXPIRADO,
} = require("../credentials/credentials.schema");
const {
  buildCompanyScope,
  getProfileCodigo,
  isSuperAdmin,
} = require("../../utils/permissions");
const approvalsService = require("../approvals/approvals.service");
const alertsService = require("../alerts/alerts.service");

const ACCESS_LIST_LIMIT = 1000;
const ACCESS_EXPORT_LIMIT = 5000;
const ACCESS_SOURCES = new Set(["event", "service_collaborator", "service_vehicle"]);
const ACCESS_STATUSES = new Set(["all", "inside", "completed"]);

const ACCESS_EXPORT_COLUMNS = [
  { key: "check_in", header: "Entrada" },
  { key: "check_out", header: "Saída" },
  { key: "source_label", header: "Origem" },
  { key: "person_or_vehicle", header: "Pessoa / Veículo" },
  { key: "document_or_plate", header: "Documento / Placa" },
  { key: "context_name", header: "Contexto" },
  { key: "company_fancy_name", header: "Empresa" },
  { key: "access_id", header: "Access ID" },
];

function buildDashboardScope(req) {
  const scope = buildCompanyScope(req.user);
  if (scope.mode === "admin") return { mode: "admin" };
  if (scope.mode === "padrao") {
    return { mode: "padrao", companyId: scope.onlyCompanyId };
  }
  if (scope.mode === "produtora") {
    return { mode: "produtora", companyId: scope.ownCompanyId };
  }
  throw new AppError("Perfil sem permissão para o dashboard operacional.", 403);
}

function credentialScopeSql(scope, aliasEdc = "edc") {
  if (scope.mode === "admin") return { sql: "", params: [] };
  if (scope.mode === "padrao") {
    return { sql: ` AND ${aliasEdc}.id_company = ?`, params: [scope.companyId] };
  }
  return {
    sql: ` AND (${aliasEdc}.id_company = ? OR ${aliasEdc}.id_producer = ?)`,
    params: [scope.companyId, scope.companyId],
  };
}

function serviceAccessScopeSql(scope, aliasSa = "sa") {
  if (scope.mode === "admin") return { sql: "", params: [] };
  return { sql: ` AND ${aliasSa}.id_company = ?`, params: [scope.companyId] };
}

function buildSummaryByStatus(rows) {
  let aprovados = 0;
  let aguardando = 0;
  let negados = 0;
  let expirados = 0;

  for (const row of rows) {
    const id = Number(row.id_access_status);
    const total = Number(row.total);
    if (id === STATUS_APROVADO) aprovados += total;
    else if (id === STATUS_AGUARDANDO_PRODUTORA || id === STATUS_AGUARDANDO_APROVACAO) aguardando += total;
    else if (id === STATUS_NEGADO) negados += total;
    else if (id === STATUS_EXPIRADO) expirados += total;
  }

  return { aprovados, aguardando, negados, expirados };
}

function mapAccessStatusKey(id) {
  switch (Number(id)) {
    case STATUS_APROVADO:
      return "ACTIVE";
    case STATUS_AGUARDANDO_PRODUTORA:
    case STATUS_AGUARDANDO_APROVACAO:
      return "PENDING";
    case STATUS_NEGADO:
      return "DENIED";
    case STATUS_EXPIRADO:
      return "EXPIRED";
    default:
      return "UNKNOWN";
  }
}

function collaboratorCompanyScopeSql(scope, aliasC = "c") {
  if (scope.mode === "admin") return { sql: "", params: [] };
  return {
    sql: ` AND EXISTS (
      SELECT 1 FROM company_collaborator cc
      WHERE cc.id_collaborator = ${aliasC}.id_collaborator AND cc.id_company = ?
    )`,
    params: [scope.companyId],
  };
}

function vehicleCompanyScopeSql(scope, aliasV = "v") {
  if (scope.mode === "admin") return { sql: "", params: [] };
  return { sql: ` AND ${aliasV}.id_company = ?`, params: [scope.companyId] };
}

function eventActiveScopeSql(scope) {
  if (scope.mode === "admin") return { sql: "", params: [] };
  if (scope.mode === "padrao") {
    return {
      sql: ` AND EXISTS (
        SELECT 1 FROM event_day ed
        INNER JOIN event_day_company edc ON edc.id_event_day = ed.id_event_day
        WHERE ed.id_event = e.id_event AND edc.id_company = ?
      )`,
      params: [scope.companyId],
    };
  }
  return {
    sql: ` AND (
      e.id_company_responsavel = ?
      OR EXISTS (
        SELECT 1 FROM event_day ed
        INNER JOIN event_day_company edc ON edc.id_event_day = ed.id_event_day
        WHERE ed.id_event = e.id_event
          AND (edc.id_company = ? OR edc.id_producer = ?)
      )
    )`,
    params: [scope.companyId, scope.companyId, scope.companyId],
  };
}

function workflowEntityScopeSql(scope) {
  if (scope.mode === "admin") return { sql: "", params: [] };
  return {
    sql: ` AND (
      (a.tipo_entidade = 'EVENTO' AND EXISTS (
        SELECT 1 FROM event e
        WHERE e.id_event = a.id_entidade
          AND (
            e.id_company_responsavel = ?
            OR EXISTS (
              SELECT 1 FROM event_day ed
              INNER JOIN event_day_company edc ON edc.id_event_day = ed.id_event_day
              WHERE ed.id_event = e.id_event
                AND (edc.id_company = ? OR edc.id_producer = ?)
            )
          )
      ))
      OR (a.tipo_entidade = 'ACESSO_SERVICO' AND EXISTS (
        SELECT 1 FROM service_access sa
        WHERE sa.id_service_access = a.id_entidade AND sa.id_company = ?
      ))
    )`,
    params: [scope.companyId, scope.companyId, scope.companyId, scope.companyId],
  };
}

async function getDashboardMetrics(req) {
  const scope = buildDashboardScope(req);
  const credScope = credentialScopeSql(scope);
  const svcScope = serviceAccessScopeSql(scope);
  const colabScope = collaboratorCompanyScopeSql(scope);
  const vehScope = vehicleCompanyScopeSql(scope);
  const eventScope = eventActiveScopeSql(scope);
  const wfScope = workflowEntityScopeSql(scope);

  const [
    [statusRows],
    [accessRows],
    [[pendingApproval]],
    [[accessToday]],
    [[currentlyInside]],
    [[accessesBySource]],
    [[denialsLast7Days]],
    [[expiredCredentials]],
    [[activeEvents]],
    [[mastersRow]],
    [[workflowRow]],
    pendingWorkflowApprovals,
    unreadAlerts,
  ] = await Promise.all([
    db.execute(
      `SELECT t.id_access_status, t.label, SUM(t.total) AS total
       FROM (
         SELECT ast.id_access_status, ast.description AS label, COUNT(*) AS total
         FROM event_day_company_collaborator edcc
         INNER JOIN access_status ast ON ast.id_access_status = edcc.id_access_status
         INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
         WHERE 1=1 ${credScope.sql}
         GROUP BY ast.id_access_status, ast.description
         UNION ALL
         SELECT ast.id_access_status, ast.description AS label, COUNT(*) AS total
         FROM service_access sa
         INNER JOIN access_status ast ON ast.id_access_status = sa.id_access_status
         WHERE 1=1 ${svcScope.sql}
         GROUP BY ast.id_access_status, ast.description
       ) t
       GROUP BY t.id_access_status, t.label
       ORDER BY t.id_access_status`,
      [...credScope.params, ...svcScope.params],
    ),
    db.execute(
      `SELECT DATE(d.access_day) AS day, COUNT(*) AS total
       FROM (
         SELECT DATE(edcc.access_check_in) AS access_day
         FROM event_day_company_collaborator edcc
         INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
         WHERE edcc.access_check_in IS NOT NULL
           AND edcc.access_check_in >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
           ${credScope.sql}
         UNION ALL
         SELECT DATE(sav.check_in) AS access_day
         FROM service_access_vehicle sav
         INNER JOIN service_access sa ON sa.id_service_access = sav.id_service_access
         WHERE sav.check_in IS NOT NULL
           AND sav.check_in >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
           ${svcScope.sql}
         UNION ALL
         SELECT DATE(sac.access_check_in) AS access_day
         FROM service_access_collaborator sac
         INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
         WHERE sac.access_check_in IS NOT NULL
           AND sac.access_check_in >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
           ${svcScope.sql}
       ) d
       GROUP BY DATE(d.access_day)
       ORDER BY day ASC`,
      [...credScope.params, ...svcScope.params, ...svcScope.params],
    ),
    db.execute(
      `SELECT (
         (SELECT COUNT(*)
          FROM event_day_company_collaborator edcc
          INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
          WHERE edcc.id_access_status = ? ${credScope.sql})
         +
         (SELECT COUNT(*)
          FROM service_access sa
          WHERE sa.id_access_status = ? ${svcScope.sql})
       ) AS total`,
      [STATUS_AGUARDANDO_APROVACAO, ...credScope.params, STATUS_AGUARDANDO_APROVACAO, ...svcScope.params],
    ),
    db.execute(
      `SELECT (
         (SELECT COUNT(*) FROM event_day_company_collaborator edcc
          INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
          WHERE DATE(edcc.access_check_in) = CURDATE() ${credScope.sql})
         +
         (SELECT COUNT(*) FROM service_access_vehicle sav
          INNER JOIN service_access sa ON sa.id_service_access = sav.id_service_access
          WHERE DATE(sav.check_in) = CURDATE() ${svcScope.sql})
         +
         (SELECT COUNT(*) FROM service_access_collaborator sac
          INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
          WHERE DATE(sac.access_check_in) = CURDATE() ${svcScope.sql})
       ) AS total`,
      [...credScope.params, ...svcScope.params, ...svcScope.params],
    ),
    db.execute(
      `SELECT (
         (SELECT COUNT(*) FROM event_day_company_collaborator edcc
          INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
          WHERE edcc.access_check_in IS NOT NULL
            AND edcc.access_check_out IS NULL
            ${credScope.sql})
         +
         (SELECT COUNT(*) FROM service_access_vehicle sav
          INNER JOIN service_access sa ON sa.id_service_access = sav.id_service_access
          WHERE sav.check_in IS NOT NULL
            AND sav.check_out IS NULL
            ${svcScope.sql})
         +
         (SELECT COUNT(*) FROM service_access_collaborator sac
          INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
          WHERE sac.access_check_in IS NOT NULL
            AND sac.access_check_out IS NULL
            ${svcScope.sql})
       ) AS total`,
      [...credScope.params, ...svcScope.params, ...svcScope.params],
    ),
    db.execute(
      `SELECT
         (SELECT COUNT(*) FROM event_day_company_collaborator edcc
          INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
          WHERE DATE(edcc.access_check_in) = CURDATE() ${credScope.sql}) AS event_total,
         (SELECT COUNT(*) FROM service_access_collaborator sac
          INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
          WHERE DATE(sac.access_check_in) = CURDATE() ${svcScope.sql}) AS service_collaborator_total,
         (SELECT COUNT(*) FROM service_access_vehicle sav
          INNER JOIN service_access sa ON sa.id_service_access = sav.id_service_access
          WHERE DATE(sav.check_in) = CURDATE() ${svcScope.sql}) AS service_vehicle_total`,
      [...credScope.params, ...svcScope.params, ...svcScope.params],
    ),
    db.execute(
      `SELECT (
         (SELECT COUNT(*)
          FROM event_day_company_collaborator_denied d
          INNER JOIN event_day_company_collaborator edcc
            ON edcc.id_event_day_company_collaborator = d.id_event_day_company_collaborator
          INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
          WHERE d.date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) ${credScope.sql})
         +
         (SELECT COUNT(*)
          FROM service_access sa
          WHERE sa.id_access_status = ?
            AND sa.atualizado_em >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            ${svcScope.sql})
         +
         (SELECT COUNT(*)
          FROM aprovacao_decisoes ad
          INNER JOIN aprovacoes a ON a.id = ad.id_aprovacao
          WHERE ad.decisao = 'REPROVADO'
            AND a.tipo_entidade = 'EVENTO'
            AND ad.decidido_em >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            ${wfScope.sql})
         +
         (SELECT COUNT(*)
          FROM document_change_request dcr
          INNER JOIN collaborator c ON c.id_collaborator = dcr.id_collaborator
          WHERE dcr.status = 'REJECTED'
            AND dcr.atualizado_em >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            ${colabScope.sql})
       ) AS total`,
      [
        ...credScope.params,
        STATUS_NEGADO,
        ...svcScope.params,
        ...wfScope.params,
        ...colabScope.params,
      ],
    ),
    db.execute(
      `SELECT (
         (SELECT COUNT(*)
          FROM event_day_company_collaborator edcc
          INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
          WHERE edcc.id_access_status = ? ${credScope.sql})
         +
         (SELECT COUNT(*)
          FROM service_access sa
          WHERE sa.id_access_status = ? ${svcScope.sql})
       ) AS total`,
      [STATUS_EXPIRADO, ...credScope.params, STATUS_EXPIRADO, ...svcScope.params],
    ),
    db.execute(
      `SELECT COUNT(*) AS total
       FROM event e
       WHERE e.ativo = 1
         AND e.start <= CURDATE()
         AND e.end >= CURDATE()
         ${eventScope.sql}`,
      eventScope.params,
    ),
    db.execute(
      `SELECT
         (SELECT COUNT(*) FROM collaborator c
          WHERE c.status = 1 ${colabScope.sql}) AS active_collaborators,
         (SELECT COUNT(*) FROM vehicle v
          WHERE v.status = 1 ${vehScope.sql}) AS active_vehicles,
         (SELECT COUNT(*) FROM collaborator_black_list bl
          INNER JOIN collaborator c ON c.id_collaborator = bl.id_collaborator
          WHERE 1=1 ${colabScope.sql}) AS blacklisted_collaborators,
         (SELECT COUNT(*) FROM vehicle_black_list vbl
          INNER JOIN vehicle v ON v.id_vehicle = vbl.id_vehicle
          WHERE 1=1 ${vehScope.sql}) AS blacklisted_vehicles,
         (SELECT COUNT(*) FROM document_change_request dcr
          INNER JOIN collaborator c ON c.id_collaborator = dcr.id_collaborator
          WHERE dcr.status = 'PENDING' ${colabScope.sql}) AS pending_document_changes`,
      [
        ...colabScope.params,
        ...vehScope.params,
        ...colabScope.params,
        ...vehScope.params,
        ...colabScope.params,
      ],
    ),
    db.execute(
      `SELECT
         SUM(CASE WHEN a.status = 'PENDENTE' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN a.status = 'APROVADO' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN a.status = 'REPROVADO' THEN 1 ELSE 0 END) AS rejected,
         AVG(
           CASE
             WHEN a.status IN ('APROVADO', 'REPROVADO')
               AND a.finalizado_em IS NOT NULL
             THEN TIMESTAMPDIFF(MINUTE, a.criado_em, a.finalizado_em)
             ELSE NULL
           END
         ) AS avg_minutes
       FROM aprovacoes a
       WHERE 1=1 ${wfScope.sql}`,
      wfScope.params,
    ),
    approvalsService.countPendingForUser(req.user).catch(() => 0),
    req.user?.id != null
      ? alertsService.countUnread(req.user.id).catch(() => 0)
      : Promise.resolve(0),
  ]);

  const summary_by_status = buildSummaryByStatus(statusRows);

  let topCompanies = [];
  let companiesByType = [];
  let activeCompanies = 0;

  if (scope.mode === "admin") {
    const [[activeCompaniesRow], [companyRows], [typeRows]] = await Promise.all([
      db.execute(`SELECT COUNT(*) AS total FROM company WHERE status = 1`),
      db.execute(
        `SELECT co.fancy_name AS label, COUNT(edcc.id_event_day_company_collaborator) AS total
         FROM company co
         INNER JOIN event_day_company edc ON edc.id_company = co.id_company
         INNER JOIN event_day_company_collaborator edcc
           ON edcc.id_event_day_company = edc.id_event_day_company
         WHERE co.status = 1 AND edcc.id_access_status = ?
         GROUP BY co.id_company, co.fancy_name
         ORDER BY total DESC
         LIMIT 5`,
        [STATUS_APROVADO],
      ),
      db.execute(
        `SELECT COALESCE(ct.description, 'Sem tipo') AS label, COUNT(*) AS total
         FROM company co
         LEFT JOIN company_type ct ON ct.id_company_type = co.id_company_type
         WHERE co.status = 1
         GROUP BY ct.id_company_type, ct.description
         ORDER BY total DESC`,
      ),
    ]);
    activeCompanies = Number(activeCompaniesRow?.total || 0);
    topCompanies = companyRows.map((r) => ({ label: r.label, total: Number(r.total) }));
    companiesByType = typeRows.map((r) => ({ label: r.label, total: Number(r.total) }));
  } else {
    const [[row]] = await db.execute(
      `SELECT COUNT(*) AS total FROM company WHERE status = 1 AND id_company = ?`,
      [scope.companyId],
    );
    activeCompanies = Number(row?.total || 0);
  }

  const approved = Number(workflowRow?.approved || 0);
  const rejected = Number(workflowRow?.rejected || 0);
  const decided = approved + rejected;
  const avgMinutes = workflowRow?.avg_minutes != null ? Number(workflowRow.avg_minutes) : null;

  return {
    credentialsByStatus: statusRows.map((r) => ({
      label: r.label,
      total: Number(r.total),
      status: mapAccessStatusKey(r.id_access_status),
      id_access_status: Number(r.id_access_status),
    })),
    accessesLast7Days: accessRows.map((r) => ({
      day: String(r.day).slice(0, 10),
      total: Number(r.total),
    })),
    accessesBySourceToday: {
      event: Number(accessesBySource?.event_total || 0),
      service_collaborator: Number(accessesBySource?.service_collaborator_total || 0),
      service_vehicle: Number(accessesBySource?.service_vehicle_total || 0),
    },
    kpis: {
      activeCompanies,
      pendingApproval: Number(pendingApproval?.total || 0),
      accessesToday: Number(accessToday?.total || 0),
      currentlyInside: Number(currentlyInside?.total || 0),
      denialsLast7Days: Number(denialsLast7Days?.total || 0),
      unreadAlerts: Number(unreadAlerts || 0),
      pendingWorkflowApprovals: Number(pendingWorkflowApprovals || 0),
      expiredCredentials: Number(expiredCredentials?.total || 0),
      activeEvents: Number(activeEvents?.total || 0),
    },
    topCompanies,
    summary_by_status,
    workflow: {
      pending: Number(workflowRow?.pending || 0),
      approved,
      rejected,
      approvalRate: decided > 0 ? Math.round((approved / decided) * 100) : null,
      avgApprovalHours:
        avgMinutes != null && !Number.isNaN(avgMinutes)
          ? Math.round((avgMinutes / 60) * 10) / 10
          : null,
    },
    masters: {
      activeCollaborators: Number(mastersRow?.active_collaborators || 0),
      activeVehicles: Number(mastersRow?.active_vehicles || 0),
      blacklistedCollaborators: Number(mastersRow?.blacklisted_collaborators || 0),
      blacklistedVehicles: Number(mastersRow?.blacklisted_vehicles || 0),
      pendingDocumentChanges: Number(mastersRow?.pending_document_changes || 0),
      companiesByType,
    },
  };
}

const DENIAL_MODULE_KEYS = new Set(["credential", "service_access", "event", "document"]);

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function parseDenialModule(value) {
  if (value == null || value === "") return null;
  const key = String(value).trim();
  return DENIAL_MODULE_KEYS.has(key) ? key : null;
}

function parseDenialEventId(value) {
  if (value == null || value === "") return null;
  const idEvent = parseInt(value, 10);
  return Number.isNaN(idEvent) ? null : idEvent;
}

function appendDateRange(conditions, params, column, dateFrom, dateTo) {
  if (dateFrom) {
    conditions.push(`${column} >= ?`);
    params.push(`${dateFrom} 00:00:00`);
  }
  if (dateTo) {
    conditions.push(`${column} <= ?`);
    params.push(`${dateTo} 23:59:59`);
  }
}

function shouldIncludeDenialModule(moduleKey, moduleFilter, hasEventFilter) {
  if (moduleFilter && moduleFilter !== moduleKey) return false;
  if (hasEventFilter && moduleKey !== "credential" && moduleKey !== "event") return false;
  return true;
}

/** Normaliza texto para collation única no UNION (evita ER_CANT_AGGREGATE_2COLLATIONS). */
function denialText(expr) {
  return `CONVERT(${expr} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
}

async function getDenials(filters = {}) {
  const moduleFilter = parseDenialModule(filters.module);
  const idEvent = parseDenialEventId(filters.id_event);
  const dateFrom = parseDateOnly(filters.date_from);
  const dateTo = parseDateOnly(filters.date_to);
  const hasEventFilter = idEvent != null;

  const arms = [];
  const params = [];

  if (shouldIncludeDenialModule("credential", moduleFilter, hasEventFilter)) {
    const conditions = [];
    if (hasEventFilter) {
      conditions.push("e.id_event = ?");
      params.push(idEvent);
    }
    appendDateRange(conditions, params, "d.date", dateFrom, dateTo);
    const whereExtra = conditions.length ? ` AND ${conditions.join(" AND ")}` : "";

    arms.push(`SELECT
       ${denialText("'credential'")} AS module_key,
       ${denialText("'Credencial'")} AS module_label,
       d.id AS id_denial,
       d.date AS denied_at,
       ${denialText("c.name")} AS collaborator_name,
       ${denialText("c.document")} AS collaborator_document,
       ${denialText("e.name")} AS context_name,
       ${denialText("co.fancy_name")} AS company_fancy_name,
       ${denialText("ast.description")} AS status_at_denial,
       ${denialText("d.reason")} AS reason
     FROM event_day_company_collaborator_denied d
     INNER JOIN event_day_company_collaborator edcc
       ON edcc.id_event_day_company_collaborator = d.id_event_day_company_collaborator
     INNER JOIN collaborator c ON c.id_collaborator = edcc.id_collaborator
     INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
     INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
     INNER JOIN event e ON e.id_event = ed.id_event
     INNER JOIN company co ON co.id_company = edc.id_company
     INNER JOIN access_status ast ON ast.id_access_status = d.id_access_status
     WHERE 1=1${whereExtra}`);
  }

  if (shouldIncludeDenialModule("service_access", moduleFilter, hasEventFilter)) {
    const conditions = [`sa.id_access_status = ?`];
    params.push(STATUS_NEGADO);
    appendDateRange(conditions, params, "sa.atualizado_em", dateFrom, dateTo);
    const whereExtra = ` AND ${conditions.join(" AND ")}`;

    arms.push(`SELECT
       ${denialText("'service_access'")} AS module_key,
       ${denialText("'Acesso de serviço'")} AS module_label,
       sa.id_service_access AS id_denial,
       sa.atualizado_em AS denied_at,
       ${denialText(`COALESCE(
         (SELECT c.name
          FROM service_access_collaborator sac
          INNER JOIN collaborator c ON c.id_collaborator = sac.id_collaborator
          WHERE sac.id_service_access = sa.id_service_access
          ORDER BY sac.id_service_access_collaborator ASC
          LIMIT 1),
         '—'
       )`)} AS collaborator_name,
       ${denialText(`COALESCE(
         (SELECT c.document
          FROM service_access_collaborator sac
          INNER JOIN collaborator c ON c.id_collaborator = sac.id_collaborator
          WHERE sac.id_service_access = sa.id_service_access
          ORDER BY sac.id_service_access_collaborator ASC
          LIMIT 1),
         '—'
       )`)} AS collaborator_document,
       ${denialText("COALESCE(NULLIF(TRIM(sa.finalidade), ''), sa.service_type, 'Acesso de serviço')")} AS context_name,
       ${denialText("co.fancy_name")} AS company_fancy_name,
       ${denialText("'Negado'")} AS status_at_denial,
       ${denialText(`CASE
         WHEN sa.observacao LIKE '%[Negado]%' THEN
           TRIM(SUBSTRING(sa.observacao, LOCATE('[Negado]', sa.observacao) + 8))
         ELSE COALESCE(NULLIF(TRIM(sa.observacao), ''), NULLIF(TRIM(sa.finalidade), ''), sa.description, '—')
       END`)} AS reason
     FROM service_access sa
     INNER JOIN company co ON co.id_company = sa.id_company
     WHERE 1=1${whereExtra}`);
  }

  if (shouldIncludeDenialModule("event", moduleFilter, hasEventFilter)) {
    const conditions = [
      "ad.decisao = 'REPROVADO'",
      "a.tipo_entidade = 'EVENTO'",
    ];
    if (hasEventFilter) {
      conditions.push("e.id_event = ?");
      params.push(idEvent);
    }
    appendDateRange(conditions, params, "ad.decidido_em", dateFrom, dateTo);
    const whereExtra = ` AND ${conditions.join(" AND ")}`;

    arms.push(`SELECT
       ${denialText("'event'")} AS module_key,
       ${denialText("'Evento'")} AS module_label,
       ad.id AS id_denial,
       ad.decidido_em AS denied_at,
       ${denialText("'—'")} AS collaborator_name,
       ${denialText("'—'")} AS collaborator_document,
       ${denialText("e.name")} AS context_name,
       ${denialText("'—'")} AS company_fancy_name,
       ${denialText("'Reprovado'")} AS status_at_denial,
       ${denialText("COALESCE(NULLIF(TRIM(ad.comentario), ''), '—')")} AS reason
     FROM aprovacao_decisoes ad
     INNER JOIN aprovacoes a ON a.id = ad.id_aprovacao
     INNER JOIN event e ON e.id_event = a.id_entidade
     WHERE 1=1${whereExtra}`);
  }

  if (shouldIncludeDenialModule("document", moduleFilter, hasEventFilter)) {
    const conditions = [`dcr.status = 'REJECTED'`];
    appendDateRange(conditions, params, "dcr.atualizado_em", dateFrom, dateTo);
    const whereExtra = ` AND ${conditions.join(" AND ")}`;

    arms.push(`SELECT
       ${denialText("'document'")} AS module_key,
       ${denialText("'Documento'")} AS module_label,
       dcr.id AS id_denial,
       dcr.atualizado_em AS denied_at,
       ${denialText("c.name")} AS collaborator_name,
       ${denialText("c.document")} AS collaborator_document,
       ${denialText("'Alteração de documento'")} AS context_name,
       ${denialText("'—'")} AS company_fancy_name,
       ${denialText("'Rejeitado'")} AS status_at_denial,
       ${denialText("COALESCE(NULLIF(TRIM(dcr.admin_reason), ''), NULLIF(TRIM(dcr.reason), ''), '—')")} AS reason
     FROM document_change_request dcr
     INNER JOIN collaborator c ON c.id_collaborator = dcr.id_collaborator
     WHERE 1=1${whereExtra}`);
  }

  if (arms.length === 0) return [];

  const [rows] = await db.execute(
    `SELECT * FROM (
       ${arms.join("\n       UNION ALL\n       ")}
     ) AS denials
     ORDER BY denials.denied_at DESC
     LIMIT 500`,
    params,
  );

  return rows;
}

function buildAccessReportScope(req) {
  const user = req.user;
  if (isSuperAdmin(user)) return { mode: "admin" };

  if (user?.requires_company) {
    const companyId = user?.id_company != null ? Number(user.id_company) : null;
    if (!companyId) {
      throw new AppError("Usuário sem empresa vinculada.", 403);
    }
    const codigo = getProfileCodigo(user);
    if (codigo === "PADRAO") {
      return { mode: "padrao", companyId };
    }
    return { mode: "produtora", companyId };
  }

  // Perfis internos com a permissão (ex.: CONTROLADOR) veem todos os acessos.
  return { mode: "admin" };
}

function parseAccessSource(value) {
  if (value == null || String(value).trim() === "") return null;
  const key = String(value).trim();
  return ACCESS_SOURCES.has(key) ? key : null;
}

function parseAccessStatus(value) {
  if (value == null || String(value).trim() === "") return "all";
  const key = String(value).trim();
  return ACCESS_STATUSES.has(key) ? key : "all";
}

function parsePositiveInt(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

function parseSearchQuery(value) {
  if (value == null) return null;
  const q = String(value).trim();
  return q ? q : null;
}

function appendAccessStatusFilter(conditions, status) {
  if (status === "inside") conditions.push("check_out IS NULL");
  else if (status === "completed") conditions.push("check_out IS NOT NULL");
}

function appendAccessSearchFilter(conditions, params, q) {
  if (!q) return;
  const like = `%${q}%`;
  conditions.push(
    "(person_or_vehicle LIKE ? OR document_or_plate LIKE ? OR context_name LIKE ? OR company_fancy_name LIKE ?)",
  );
  params.push(like, like, like, like);
}

function shouldIncludeAccessSource(sourceKey, sourceFilter, hasEventFilter) {
  if (sourceFilter && sourceFilter !== sourceKey) return false;
  if (hasEventFilter && sourceKey !== "event") return false;
  return true;
}

function buildAccessArms(scope, filters) {
  const sourceFilter = parseAccessSource(filters.source);
  const idEvent = parsePositiveInt(filters.id_event);
  const idCompany = parsePositiveInt(filters.id_company);
  const dateFrom = parseDateOnly(filters.date_from);
  const dateTo = parseDateOnly(filters.date_to);
  const hasEventFilter = idEvent != null;

  const credScope = credentialScopeSql(scope);
  const svcScope = serviceAccessScopeSql(scope);

  const arms = [];
  const params = [];

  if (shouldIncludeAccessSource("event", sourceFilter, hasEventFilter)) {
    const conditions = ["edcc.access_check_in IS NOT NULL"];
    const armParams = [];

    if (hasEventFilter) {
      conditions.push("e.id_event = ?");
      armParams.push(idEvent);
    }
    if (idCompany != null) {
      conditions.push("edc.id_company = ?");
      armParams.push(idCompany);
    }
    appendDateRange(conditions, armParams, "edcc.access_check_in", dateFrom, dateTo);

    arms.push(`SELECT
       'event' AS source_key,
       'Credencial de evento' AS source_label,
       c.name AS person_or_vehicle,
       COALESCE(c.document, '—') AS document_or_plate,
       co.fancy_name AS company_fancy_name,
       e.name AS context_name,
       edcc.access_check_in AS check_in,
       edcc.access_check_out AS check_out,
       edcc.access_id AS access_id,
       e.id_event AS id_event,
       CAST(NULL AS SIGNED) AS id_service_access,
       edc.id_company AS id_company
     FROM event_day_company_collaborator edcc
     INNER JOIN collaborator c ON c.id_collaborator = edcc.id_collaborator
     INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
     INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
     INNER JOIN event e ON e.id_event = ed.id_event
     INNER JOIN company co ON co.id_company = edc.id_company
     WHERE ${conditions.join(" AND ")}${credScope.sql}`);
    params.push(...armParams, ...credScope.params);
  }

  if (shouldIncludeAccessSource("service_collaborator", sourceFilter, hasEventFilter)) {
    const conditions = [
      "gal.kind = 'collaborator'",
      "gal.check_in IS NOT NULL",
    ];
    const armParams = [];

    if (idCompany != null) {
      conditions.push("sa.id_company = ?");
      armParams.push(idCompany);
    }
    appendDateRange(conditions, armParams, "gal.check_in", dateFrom, dateTo);

    arms.push(`SELECT
       'service_collaborator' AS source_key,
       'Serviço — colaborador' AS source_label,
       COALESCE(c.name, '—') AS person_or_vehicle,
       COALESCE(c.document, '—') AS document_or_plate,
       co.fancy_name AS company_fancy_name,
       COALESCE(NULLIF(TRIM(sa.finalidade), ''), sa.service_type, 'Acesso de serviço') AS context_name,
       gal.check_in AS check_in,
       gal.check_out AS check_out,
       gal.access_id AS access_id,
       CAST(NULL AS SIGNED) AS id_event,
       sa.id_service_access AS id_service_access,
       sa.id_company AS id_company
     FROM gate_access_day_log gal
     INNER JOIN service_access sa ON sa.id_service_access = gal.id_service_access
     INNER JOIN company co ON co.id_company = sa.id_company
     LEFT JOIN service_access_collaborator sac
       ON sac.id_service_access_collaborator = gal.id_ref
     LEFT JOIN collaborator c ON c.id_collaborator = sac.id_collaborator
     WHERE ${conditions.join(" AND ")}${svcScope.sql}`);
    params.push(...armParams, ...svcScope.params);
  }

  if (shouldIncludeAccessSource("service_vehicle", sourceFilter, hasEventFilter)) {
    const conditions = [
      "gal.kind = 'vehicle'",
      "gal.check_in IS NOT NULL",
    ];
    const armParams = [];

    if (idCompany != null) {
      conditions.push("sa.id_company = ?");
      armParams.push(idCompany);
    }
    appendDateRange(conditions, armParams, "gal.check_in", dateFrom, dateTo);

    arms.push(`SELECT
       'service_vehicle' AS source_key,
       'Serviço — veículo' AS source_label,
       COALESCE(v.plate, '—') AS person_or_vehicle,
       COALESCE(
         NULLIF(TRIM(CONCAT_WS(' ', v.brand, v.model, v.color)), ''),
         v.plate,
         '—'
       ) AS document_or_plate,
       co.fancy_name AS company_fancy_name,
       COALESCE(NULLIF(TRIM(sa.finalidade), ''), sa.service_type, 'Acesso de serviço') AS context_name,
       gal.check_in AS check_in,
       gal.check_out AS check_out,
       gal.access_id AS access_id,
       CAST(NULL AS SIGNED) AS id_event,
       sa.id_service_access AS id_service_access,
       sa.id_company AS id_company
     FROM gate_access_day_log gal
     INNER JOIN service_access sa ON sa.id_service_access = gal.id_service_access
     INNER JOIN company co ON co.id_company = sa.id_company
     LEFT JOIN service_access_vehicle sav
       ON sav.id_service_access_vehicle = gal.id_ref
     LEFT JOIN vehicle v ON v.id_vehicle = sav.id_vehicle
     WHERE ${conditions.join(" AND ")}${svcScope.sql}`);
    params.push(...armParams, ...svcScope.params);
  }

  return { arms, params };
}

function buildAccessOuterFilters(filters) {
  const status = parseAccessStatus(filters.status);
  const q = parseSearchQuery(filters.q);
  const conditions = [];
  const params = [];
  appendAccessStatusFilter(conditions, status);
  appendAccessSearchFilter(conditions, params, q);
  return {
    status,
    q,
    whereSql: conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

function emptyAccessSummary() {
  return {
    total: 0,
    inside: 0,
    completed: 0,
    by_source: {
      event: 0,
      service_collaborator: 0,
      service_vehicle: 0,
    },
  };
}

async function fetchAccessRows(req, filters, limit) {
  const scope = buildAccessReportScope(req);
  const { arms, params } = buildAccessArms(scope, filters);
  if (arms.length === 0) {
    return { rows: [], summary: emptyAccessSummary() };
  }

  const outer = buildAccessOuterFilters(filters);
  const baseSql = `SELECT * FROM (
       ${arms.join("\n       UNION ALL\n       ")}
     ) AS accesses
     ${outer.whereSql}`;
  const queryParams = [...params, ...outer.params];

  const [[agg]] = await db.execute(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN check_out IS NULL THEN 1 ELSE 0 END) AS inside,
       SUM(CASE WHEN check_out IS NOT NULL THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN source_key = 'event' THEN 1 ELSE 0 END) AS event_total,
       SUM(CASE WHEN source_key = 'service_collaborator' THEN 1 ELSE 0 END) AS service_collaborator_total,
       SUM(CASE WHEN source_key = 'service_vehicle' THEN 1 ELSE 0 END) AS service_vehicle_total
     FROM (${baseSql}) AS access_stats`,
    queryParams,
  );

  const [rows] = await db.execute(
    `${baseSql}
     ORDER BY accesses.check_in DESC
     LIMIT ${Number(limit)}`,
    queryParams,
  );

  const summary = {
    total: Number(agg?.total || 0),
    inside: Number(agg?.inside || 0),
    completed: Number(agg?.completed || 0),
    by_source: {
      event: Number(agg?.event_total || 0),
      service_collaborator: Number(agg?.service_collaborator_total || 0),
      service_vehicle: Number(agg?.service_vehicle_total || 0),
    },
  };

  return { rows, summary };
}

async function getAccesses(req, filters = {}) {
  return fetchAccessRows(req, filters, ACCESS_LIST_LIMIT);
}

function cellValue(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function exportAccessesXlsx(req, filters = {}) {
  const { rows } = await fetchAccessRows(req, filters, ACCESS_EXPORT_LIMIT);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Acessos");
  const headers = ACCESS_EXPORT_COLUMNS.map((c) => c.header);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow(
      ACCESS_EXPORT_COLUMNS.map((col) => {
        const value = row[col.key];
        if ((col.key === "check_in" || col.key === "check_out") && value) {
          return new Date(value);
        }
        return cellValue(value);
      }),
    );
  }

  sheet.columns.forEach((col) => {
    let max = 10;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > max) max = Math.min(len, 60);
    });
    col.width = max + 2;
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    buffer,
    filename: `relatorio-acessos-${date}.xlsx`,
    rowCount: rows.length,
  };
}

module.exports = {
  getDashboardMetrics,
  getDenials,
  getAccesses,
  exportAccessesXlsx,
};
