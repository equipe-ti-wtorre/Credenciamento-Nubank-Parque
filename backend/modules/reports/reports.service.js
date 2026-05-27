const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { STATUS_AGUARDANDO_ALLIANZ, STATUS_APROVADO } = require("../credentials/credentials.schema");

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

async function getDashboardMetrics(req) {
  const scope = buildDashboardScope(req);
  const credScope = credentialScopeSql(scope);

  const [statusRows] = await db.execute(
    `SELECT ast.description AS label, COUNT(*) AS total
     FROM event_day_company_collaborator edcc
     INNER JOIN access_status ast ON ast.id_access_status = edcc.id_access_status
     INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
     WHERE 1=1 ${credScope.sql}
     GROUP BY ast.id_access_status, ast.description
     ORDER BY ast.id_access_status`,
    credScope.params,
  );

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
  };
}

module.exports = { getDashboardMetrics };
