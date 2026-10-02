const ExcelJS = require("exceljs");
const db = require("../../config/db");
const { AUDIT_MODULES, AUDIT_ACTIONS } = require("../../observability/audit.constants");

const EXPORT_MAX_ROWS = 10000;

const EXPORT_COLUMNS = [
  { key: "created_at", header: "Data" },
  { key: "user_name", header: "Usuário" },
  { key: "user_email", header: "E-mail" },
  { key: "action", header: "Ação" },
  { key: "module", header: "Módulo" },
  { key: "ip", header: "IP" },
  { key: "resource", header: "Recurso" },
  { key: "changes", header: "Alterações" },
  { key: "request_id", header: "Request ID" },
];

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return value.trim();
}

function tryParseJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function cellValue(value) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildAuditWhere(filters) {
  const conditions = [];
  const params = [];

  if (filters.module) {
    conditions.push("a.module = ?");
    params.push(String(filters.module).trim());
  }
  if (filters.action) {
    conditions.push("a.action = ?");
    params.push(String(filters.action).trim());
  }
  if (filters.user_id) {
    const uid = parseInt(filters.user_id, 10);
    if (!Number.isNaN(uid)) {
      conditions.push("a.user_id = ?");
      params.push(uid);
    }
  }
  const q = filters.q ? String(filters.q).trim() : "";
  if (q) {
    conditions.push("(u.nome_completo LIKE ? OR u.email LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like);
  }
  const from = parseDateOnly(filters.from);
  if (from) {
    conditions.push("a.created_at >= ?");
    params.push(`${from} 00:00:00`);
  }
  const to = parseDateOnly(filters.to);
  if (to) {
    conditions.push("a.created_at <= ?");
    params.push(`${to} 23:59:59`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

function mapAuditRow(row) {
  const metadata = tryParseJson(row.metadata);
  return {
    id: row.id,
    user_id: row.user_id,
    action: row.action,
    module: row.module,
    ip: row.ip,
    client_type: row.client_type,
    request_id: row.request_id,
    metadata,
    created_at: row.created_at,
    user: row.user_id
      ? {
          id: row.user_id,
          name: row.user_name || null,
          email: row.user_email || null,
        }
      : null,
  };
}

const SELECT_COLUMNS = `
  a.id, a.user_id, a.action, a.module, a.ip, a.client_type, a.request_id,
  a.metadata, a.created_at, u.nome_completo AS user_name, u.email AS user_email
`;

const FROM_JOIN = `
  FROM audit_logs a
  LEFT JOIN usuarios u ON u.id = a.user_id
`;

async function listAudit({ page = 1, limit = 20, filters = {} }) {
  const offset = (page - 1) * limit;
  const { where, params } = buildAuditWhere(filters);

  const [rows] = await db.execute(
    `SELECT ${SELECT_COLUMNS}
     ${FROM_JOIN}
     ${where}
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) AS total ${FROM_JOIN} ${where}`,
    params,
  );

  return {
    items: rows.map(mapAuditRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function fetchAuditForExport(filters) {
  const { where, params } = buildAuditWhere(filters);
  const [rows] = await db.execute(
    `SELECT ${SELECT_COLUMNS}
     ${FROM_JOIN}
     ${where}
     ORDER BY a.created_at DESC
     LIMIT ?`,
    [...params, EXPORT_MAX_ROWS],
  );
  return rows.map(mapAuditRow);
}

async function exportAuditXlsx(filters) {
  const items = await fetchAuditForExport(filters);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Auditoria");
  sheet.addRow(EXPORT_COLUMNS.map((col) => col.header));
  sheet.getRow(1).font = { bold: true };

  for (const item of items) {
    const meta = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
    sheet.addRow([
      cellValue(item.created_at),
      cellValue(item.user?.name),
      cellValue(item.user?.email),
      cellValue(item.action),
      cellValue(item.module),
      cellValue(item.ip),
      cellValue(meta.resource ?? null),
      cellValue(meta.changes ?? null),
      cellValue(item.request_id),
    ]);
  }

  sheet.columns.forEach((col) => {
    let max = 12;
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
    filename: `auditoria-${date}.xlsx`,
    rowCount: items.length,
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), "pt-BR"),
  );
}

async function listFilterOptions() {
  const [moduleRows] = await db.execute(
    "SELECT DISTINCT module FROM audit_logs WHERE module IS NOT NULL AND module <> '' ORDER BY module",
  );
  const [actionRows] = await db.execute(
    "SELECT DISTINCT action FROM audit_logs WHERE action IS NOT NULL AND action <> '' ORDER BY action",
  );
  const [userRows] = await db.execute(
    `SELECT DISTINCT a.user_id AS id, u.nome_completo AS name, u.email
     FROM audit_logs a
     LEFT JOIN usuarios u ON u.id = a.user_id
     WHERE a.user_id IS NOT NULL
     ORDER BY u.nome_completo IS NULL, u.nome_completo, u.email`,
  );

  return {
    modules: uniqueSorted([
      ...Object.values(AUDIT_MODULES),
      ...moduleRows.map((row) => row.module),
    ]),
    actions: uniqueSorted([
      ...Object.values(AUDIT_ACTIONS),
      ...actionRows.map((row) => row.action),
    ]),
    users: userRows.map((row) => ({
      id: row.id,
      name: row.name || null,
      email: row.email || null,
    })),
  };
}

function parseListQuery(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit };
}

function parseAuditFilters(query) {
  return {
    module: query.module,
    action: query.action,
    user_id: query.user_id,
    q: query.q,
    from: query.from,
    to: query.to,
  };
}

module.exports = {
  EXPORT_MAX_ROWS,
  listAudit,
  exportAuditXlsx,
  listFilterOptions,
  parseListQuery,
  parseAuditFilters,
};
