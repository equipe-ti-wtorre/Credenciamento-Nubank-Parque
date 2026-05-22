const ExcelJS = require("exceljs");
const db = require("../../config/db");

const EXPORT_MAX_ROWS = 10000;

const AUDIT_COLUMNS = [
  "id",
  "created_at",
  "user_id",
  "action",
  "module",
  "ip",
  "client_type",
  "request_id",
  "metadata",
];

const ERROR_COLUMNS = [
  "id",
  "created_at",
  "level",
  "module",
  "message",
  "status_code",
  "user_id",
  "ip",
  "client_type",
  "request_id",
  "path",
  "method",
  "stack",
  "metadata",
];

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return value.trim();
}

function buildAuditWhere(filters) {
  const conditions = [];
  const params = [];

  if (filters.module) {
    conditions.push("module = ?");
    params.push(String(filters.module).trim());
  }
  if (filters.action) {
    conditions.push("action = ?");
    params.push(String(filters.action).trim());
  }
  if (filters.user_id) {
    const uid = parseInt(filters.user_id, 10);
    if (!Number.isNaN(uid)) {
      conditions.push("user_id = ?");
      params.push(uid);
    }
  }
  const from = parseDateOnly(filters.from);
  if (from) {
    conditions.push("created_at >= ?");
    params.push(`${from} 00:00:00`);
  }
  const to = parseDateOnly(filters.to);
  if (to) {
    conditions.push("created_at <= ?");
    params.push(`${to} 23:59:59`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

function buildErrorWhere(filters) {
  const conditions = [];
  const params = [];

  if (filters.module) {
    conditions.push("module = ?");
    params.push(String(filters.module).trim());
  }
  if (filters.level) {
    conditions.push("level = ?");
    params.push(String(filters.level).trim());
  }
  if (filters.status_code) {
    const code = parseInt(filters.status_code, 10);
    if (!Number.isNaN(code)) {
      conditions.push("status_code = ?");
      params.push(code);
    }
  }
  const from = parseDateOnly(filters.from);
  if (from) {
    conditions.push("created_at >= ?");
    params.push(`${from} 00:00:00`);
  }
  const to = parseDateOnly(filters.to);
  if (to) {
    conditions.push("created_at <= ?");
    params.push(`${to} 23:59:59`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

function mapAuditRow(row) {
  return {
    ...row,
    metadata:
      row.metadata != null && typeof row.metadata === "string"
        ? tryParseJson(row.metadata)
        : row.metadata,
  };
}

function mapErrorRow(row) {
  return {
    ...row,
    metadata:
      row.metadata != null && typeof row.metadata === "string"
        ? tryParseJson(row.metadata)
        : row.metadata,
  };
}

function tryParseJson(value) {
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

async function listAudit({ page = 1, limit = 20, filters = {} }) {
  const offset = (page - 1) * limit;
  const { where, params } = buildAuditWhere(filters);

  const [rows] = await db.execute(
    `SELECT id, user_id, action, module, ip, client_type, request_id, metadata, created_at
     FROM audit_logs ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) AS total FROM audit_logs ${where}`,
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

async function listErrors({ page = 1, limit = 20, filters = {} }) {
  const offset = (page - 1) * limit;
  const { where, params } = buildErrorWhere(filters);

  const [rows] = await db.execute(
    `SELECT id, level, module, message, status_code, user_id, ip, client_type, request_id,
            path, method, stack, metadata, created_at
     FROM app_error_logs ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) AS total FROM app_error_logs ${where}`,
    params,
  );

  return {
    items: rows.map(mapErrorRow),
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
    `SELECT id, created_at, user_id, action, module, ip, client_type, request_id, metadata
     FROM audit_logs ${where}
     ORDER BY created_at DESC
     LIMIT ?`,
    [...params, EXPORT_MAX_ROWS],
  );
  return rows.map(mapAuditRow);
}

async function fetchErrorsForExport(filters) {
  const { where, params } = buildErrorWhere(filters);
  const [rows] = await db.execute(
    `SELECT id, created_at, level, module, message, status_code, user_id, ip, client_type,
            request_id, path, method, stack, metadata
     FROM app_error_logs ${where}
     ORDER BY created_at DESC
     LIMIT ?`,
    [...params, EXPORT_MAX_ROWS],
  );
  return rows.map(mapErrorRow);
}

async function buildWorkbookBuffer(sheetName, headers, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };

  for (const row of rows) {
    sheet.addRow(headers.map((col) => cellValue(row[col])));
  }

  sheet.columns.forEach((col) => {
    let max = 10;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > max) max = Math.min(len, 60);
    });
    col.width = max + 2;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function exportAuditXlsx(filters) {
  const rows = await fetchAuditForExport(filters);
  const buffer = await buildWorkbookBuffer("Auditoria", AUDIT_COLUMNS, rows);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    buffer,
    filename: `audit-logs-${date}.xlsx`,
    rowCount: rows.length,
  };
}

async function exportErrorsXlsx(filters) {
  const rows = await fetchErrorsForExport(filters);
  const buffer = await buildWorkbookBuffer("Erros", ERROR_COLUMNS, rows);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    buffer,
    filename: `error-logs-${date}.xlsx`,
    rowCount: rows.length,
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
    from: query.from,
    to: query.to,
  };
}

function parseErrorFilters(query) {
  return {
    module: query.module,
    level: query.level,
    status_code: query.status_code,
    from: query.from,
    to: query.to,
  };
}

module.exports = {
  EXPORT_MAX_ROWS,
  listAudit,
  listErrors,
  exportAuditXlsx,
  exportErrorsXlsx,
  parseListQuery,
  parseAuditFilters,
  parseErrorFilters,
};
