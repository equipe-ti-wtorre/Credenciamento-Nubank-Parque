const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const {
  STATUS_AGUARDANDO_PRODUTORA,
  STATUS_AGUARDANDO_ALLIANZ,
  STATUS_APROVADO,
  STATUS_NEGADO,
} = require("../credentials/credentials.schema");

function getUserRole(req) {
  return String(req.user?.role || req.user?.perfil || "USER").toUpperCase();
}

function buildDashboardScope(req) {
  const role = getUserRole(req);
  const idCompany = req.user?.id_company != null ? Number(req.user.id_company) : null;

  if (role === "ADMIN") return { mode: "admin" };
  if (role === "PADRAO") {
    if (!idCompany) throw new AppError("Usuário sem empresa vinculada.", 403);
    return { mode: "padrao", companyId: idCompany };
  }
  if (role === "PRODUTORA") {
    if (!idCompany) throw new AppError("Usuário produtora sem empresa vinculada.", 403);
    return { mode: "produtora", companyId: idCompany };
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

function buildSummaryByStatus(rows) {
  let aprovados = 0;
  let aguardando = 0;
  let negados = 0;

  for (const row of rows) {
    const id = Number(row.id_access_status);
    const total = Number(row.total);
    if (id === STATUS_APROVADO) aprovados += total;
    else if (id === STATUS_AGUARDANDO_PRODUTORA || id === STATUS_AGUARDANDO_ALLIANZ) aguardando += total;
    else if (id === STATUS_NEGADO) negados += total;
  }

  return { aprovados, aguardando, negados };
}

async function getDashboardMetrics(req) {
  const scope = buildDashboardScope(req);
  const credScope = credentialScopeSql(scope);

  const [statusRows] = await db.execute(
    `SELECT ast.id_access_status, ast.description AS label, COUNT(*) AS total
     FROM event_day_company_collaborator edcc
     INNER JOIN access_status ast ON ast.id_access_status = edcc.id_access_status
     INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
     WHERE 1=1 ${credScope.sql}
     GROUP BY ast.id_access_status, ast.description
     ORDER BY ast.id_access_status`,
    credScope.params,
  );

  const summary_by_status = buildSummaryByStatus(statusRows);

  const [accessRows] = await db.execute(
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
         ${scope.mode === "admin" ? "" : " AND sa.id_company = ?"}
     ) d
     GROUP BY DATE(d.access_day)
     ORDER BY day ASC`,
    scope.mode === "admin" ? credScope.params : [...credScope.params, scope.companyId],
  );

  const [[pendingAllianz]] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM event_day_company_collaborator edcc
     INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
     WHERE edcc.id_access_status = ? ${credScope.sql}`,
    [STATUS_AGUARDANDO_ALLIANZ, ...credScope.params],
  );

  const [[accessToday]] = await db.execute(
    `SELECT (
       (SELECT COUNT(*) FROM event_day_company_collaborator edcc
        INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
        WHERE DATE(edcc.access_check_in) = CURDATE() ${credScope.sql})
       +
       (SELECT COUNT(*) FROM service_access_vehicle sav
        INNER JOIN service_access sa ON sa.id_service_access = sav.id_service_access
        WHERE DATE(sav.check_in) = CURDATE()
        ${scope.mode === "admin" ? "" : " AND sa.id_company = ?"})
     ) AS total`,
    scope.mode === "admin" ? credScope.params : [...credScope.params, scope.companyId],
  );

  let topCompanies = [];
  if (scope.mode === "admin") {
    const [companyRows] = await db.execute(
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
    );
    topCompanies = companyRows.map((r) => ({ label: r.label, total: Number(r.total) }));
  }

  const [activeCompanies] = await db.execute(
    `SELECT COUNT(*) AS total FROM company WHERE status = 1`,
  );

  return {
    credentialsByStatus: statusRows.map((r) => ({
      label: r.label,
      total: Number(r.total),
    })),
    accessesLast7Days: accessRows.map((r) => ({
      day: String(r.day).slice(0, 10),
      total: Number(r.total),
    })),
    kpis: {
      activeCompanies: Number(activeCompanies[0]?.total || 0),
      pendingAllianz: Number(pendingAllianz?.total || 0),
      accessesToday: Number(accessToday?.total || 0),
    },
    topCompanies,
    summary_by_status,
  };
}

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function buildDenialsWhere(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.id_event != null && filters.id_event !== "") {
    const idEvent = parseInt(filters.id_event, 10);
    if (!Number.isNaN(idEvent)) {
      conditions.push("e.id_event = ?");
      params.push(idEvent);
    }
  }

  const dateFrom = parseDateOnly(filters.date_from);
  if (dateFrom) {
    conditions.push("d.date >= ?");
    params.push(`${dateFrom} 00:00:00`);
  }

  const dateTo = parseDateOnly(filters.date_to);
  if (dateTo) {
    conditions.push("d.date <= ?");
    params.push(`${dateTo} 23:59:59`);
  }

  const sql = conditions.length ? ` AND ${conditions.join(" AND ")}` : "";
  return { sql, params };
}

async function getDenials(filters = {}) {
  const { sql: filterSql, params } = buildDenialsWhere(filters);

  const [rows] = await db.execute(
    `SELECT
       d.id AS id_denial,
       d.date AS denied_at,
       c.name AS collaborator_name,
       c.document AS collaborator_document,
       e.name AS event_name,
       co.fancy_name AS company_fancy_name,
       ast.description AS status_at_denial,
       d.reason AS reason
     FROM event_day_company_collaborator_denied d
     INNER JOIN event_day_company_collaborator edcc
       ON edcc.id_event_day_company_collaborator = d.id_event_day_company_collaborator
     INNER JOIN collaborator c ON c.id_collaborator = edcc.id_collaborator
     INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
     INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
     INNER JOIN event e ON e.id_event = ed.id_event
     INNER JOIN company co ON co.id_company = edc.id_company
     INNER JOIN access_status ast ON ast.id_access_status = d.id_access_status
     WHERE 1=1${filterSql}
     ORDER BY d.date DESC
     LIMIT 500`,
    params,
  );

  return rows;
}

module.exports = { getDashboardMetrics, getDenials };
