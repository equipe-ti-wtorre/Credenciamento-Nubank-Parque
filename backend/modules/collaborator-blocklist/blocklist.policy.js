const db = require("../../config/db");
const AppError = require("../../utils/AppError");

const BLOCK_TYPES = ["permanent", "days", "events"];
const ERROR_CODE = "COLLABORATOR_BLOCKLISTED";

function eventsElapsedSql(alias = "bl") {
  return `(
    SELECT COUNT(*) FROM event_accreditation ea
    WHERE ea.ativo = 1
      AND ea.\`end\` >= DATE(${alias}.criado_em)
      AND ea.\`end\` < CURDATE()
  )`;
}

function activeBlockJoinSql(alias = "bl") {
  return `(
    ${alias}.block_type = 'permanent'
    OR (
      ${alias}.block_type = 'days'
      AND ${alias}.blocked_until IS NOT NULL
      AND ${alias}.blocked_until > NOW()
    )
    OR (
      ${alias}.block_type = 'events'
      AND ${alias}.block_value IS NOT NULL
      AND ${eventsElapsedSql(alias)} < ${alias}.block_value
    )
  )`;
}

function existsActiveBlockSql(collaboratorExpr, alias = "bl") {
  return `EXISTS (
    SELECT 1 FROM collaborator_block_list ${alias}
    WHERE ${alias}.id_collaborator = ${collaboratorExpr}
      AND ${activeBlockJoinSql(alias)}
  )`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function toMysqlDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function computeBlockedUntil(blockType, blockValue) {
  if (blockType !== "days") return null;
  const until = new Date();
  until.setDate(until.getDate() + Number(blockValue));
  return toMysqlDateTime(until);
}

function remainingDaysFromUntil(blockedUntil) {
  if (!blockedUntil) return null;
  const until = blockedUntil instanceof Date ? blockedUntil : new Date(blockedUntil);
  if (Number.isNaN(until.getTime())) return null;
  const ms = until.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function toDateKey(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value || "").slice(0, 10);
}

async function countElapsedEvents(sinceDate) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS total FROM event_accreditation
     WHERE ativo = 1 AND \`end\` >= DATE(?) AND \`end\` < CURDATE()`,
    [sinceDate],
  );
  return Number(rows[0]?.total) || 0;
}

async function loadFinishedAccreditationEnds(sinceDate) {
  const [rows] = await db.execute(
    `SELECT \`end\` AS end_date FROM event_accreditation
     WHERE ativo = 1 AND \`end\` >= DATE(?) AND \`end\` < CURDATE()`,
    [sinceDate],
  );
  return rows.map((r) => toDateKey(r.end_date));
}

function countEventsSince(ends, criadoEm) {
  const start = toDateKey(criadoEm);
  if (!start) return 0;
  return ends.filter((d) => d && d >= start).length;
}

function isRowActive(row, eventsElapsed = 0) {
  const type = String(row.block_type || "permanent");
  if (type === "days") {
    return remainingDaysFromUntil(row.blocked_until) > 0;
  }
  if (type === "events") {
    const quota = Number(row.block_value);
    return Number.isFinite(quota) && quota > 0 && eventsElapsed < quota;
  }
  return true;
}

function buildBlockInfo(row, eventsElapsed = 0) {
  const type = String(row.block_type || "permanent");
  const reason =
    row.reason != null && String(row.reason).trim() ? String(row.reason).trim() : null;
  const remainingDays = type === "days" ? remainingDaysFromUntil(row.blocked_until) : null;
  const remainingEvents =
    type === "events" ? Math.max(0, Number(row.block_value || 0) - eventsElapsed) : null;

  return {
    is_blocklisted: true,
    blocklist_reason: reason,
    reason,
    block_type: type,
    block_value: row.block_value != null ? Number(row.block_value) : null,
    blocked_until: row.blocked_until || null,
    remaining_days: remainingDays,
    remaining_events: remainingEvents,
    events_elapsed: type === "events" ? eventsElapsed : null,
    criado_em: row.criado_em || null,
    id_usuario: row.id_usuario != null ? Number(row.id_usuario) : null,
    id_collaborator: Number(row.id_collaborator),
  };
}

function formatPeriodLabel(info) {
  if (!info) return "";
  if (info.block_type === "days") {
    const days = info.remaining_days;
    if (days == null) return "Bloqueio por prazo.";
    if (days <= 0) return "O prazo de bloqueio encerrou.";
    return days === 1 ? "Resta 1 dia de bloqueio." : `Restam ${days} dias de bloqueio.`;
  }
  if (info.block_type === "events") {
    const left = info.remaining_events;
    if (left == null) return "Bloqueio por eventos.";
    if (left <= 0) return "O prazo de bloqueio por eventos encerrou.";
    return left === 1
      ? "Falta 1 evento sem acesso."
      : `Faltam ${left} eventos sem acesso.`;
  }
  return "Bloqueio permanente.";
}

function formatNotice(info) {
  const parts = ["Este colaborador está impedido de acessar a arena."];
  if (info?.reason || info?.blocklist_reason) {
    parts.push(`Motivo: ${info.reason || info.blocklist_reason}.`);
  }
  const period = formatPeriodLabel(info);
  if (period) parts.push(period);
  return parts.join(" ");
}

function emptyBlockInfo() {
  return {
    is_blocklisted: false,
    blocklist_reason: null,
    reason: null,
    block_type: null,
    block_value: null,
    blocked_until: null,
    remaining_days: null,
    remaining_events: null,
    events_elapsed: null,
    criado_em: null,
    id_usuario: null,
    id_collaborator: null,
  };
}

function applyBlocklistFields(target, info = null) {
  const active = !!info?.is_blocklisted;
  target.is_blocklisted = active;
  target.blocklist_reason = active ? info.blocklist_reason || info.reason || null : null;
  target.block_type = active ? info.block_type || null : null;
  target.block_value = active ? info.block_value ?? null : null;
  target.blocked_until = active ? info.blocked_until || null : null;
  target.remaining_days = active ? info.remaining_days ?? null : null;
  target.remaining_events = active ? info.remaining_events ?? null : null;
  return target;
}

async function expireDueBlocks() {
  await db.execute(
    `DELETE FROM collaborator_block_list
     WHERE block_type = 'days'
       AND blocked_until IS NOT NULL
       AND blocked_until <= NOW()`,
  );
  await db.execute(
    `DELETE bl FROM collaborator_block_list bl
     WHERE bl.block_type = 'events'
       AND bl.block_value IS NOT NULL
       AND ${eventsElapsedSql("bl")} >= bl.block_value`,
  );
}

async function getActiveBlock(idCollaborator) {
  const [rows] = await db.execute(
    `SELECT * FROM collaborator_block_list WHERE id_collaborator = ? LIMIT 1`,
    [idCollaborator],
  );
  if (!rows.length) return null;

  const row = rows[0];
  const eventsElapsed =
    String(row.block_type) === "events" ? await countElapsedEvents(row.criado_em) : 0;

  if (!isRowActive(row, eventsElapsed)) {
    await db.execute("DELETE FROM collaborator_block_list WHERE id_collaborator = ?", [
      idCollaborator,
    ]);
    return null;
  }
  return buildBlockInfo(row, eventsElapsed);
}

async function batchActiveBlockInfo(ids) {
  const normalized = [...new Set(ids.map((id) => Number(id)).filter((id) => id > 0))];
  const result = new Map();
  if (!normalized.length) return result;

  const placeholders = normalized.map(() => "?").join(",");
  const [rows] = await db.execute(
    `SELECT * FROM collaborator_block_list WHERE id_collaborator IN (${placeholders})`,
    normalized,
  );
  if (!rows.length) return result;

  const eventRows = rows.filter((r) => String(r.block_type) === "events");
  let ends = [];
  if (eventRows.length) {
    const oldest = eventRows.reduce((min, r) => {
      const key = toDateKey(r.criado_em);
      return !min || key < min ? key : min;
    }, "");
    ends = oldest ? await loadFinishedAccreditationEnds(oldest) : [];
  }

  const expiredIds = [];
  for (const row of rows) {
    const eventsElapsed =
      String(row.block_type) === "events" ? countEventsSince(ends, row.criado_em) : 0;
    if (!isRowActive(row, eventsElapsed)) {
      expiredIds.push(Number(row.id_collaborator));
      continue;
    }
    result.set(Number(row.id_collaborator), buildBlockInfo(row, eventsElapsed));
  }

  if (expiredIds.length) {
    const expPh = expiredIds.map(() => "?").join(",");
    await db.execute(
      `DELETE FROM collaborator_block_list WHERE id_collaborator IN (${expPh})`,
      expiredIds,
    );
  }

  return result;
}

async function checkBlocklist(idCollaborator) {
  const info = await getActiveBlock(idCollaborator);
  return !!info;
}

async function batchBlocklistedIds(ids) {
  const map = await batchActiveBlockInfo(ids);
  return new Set(map.keys());
}

function throwBlocklistedError(info) {
  throw new AppError(formatNotice(info), 403, true, {
    reason: info.reason || info.blocklist_reason || null,
    block_type: info.block_type,
    block_value: info.block_value,
    blocked_until: info.blocked_until,
    remaining_days: info.remaining_days,
    remaining_events: info.remaining_events,
  }, ERROR_CODE);
}

async function assertNotBlocklisted(idCollaborator) {
  const info = await getActiveBlock(idCollaborator);
  if (info) throwBlocklistedError(info);
  return null;
}

function normalizePeriod({ block_type, block_value }) {
  const type = String(block_type || "permanent");
  if (!BLOCK_TYPES.includes(type)) {
    throw new AppError("Tipo de bloqueio inválido.", 400);
  }
  if (type === "permanent") {
    return { block_type: "permanent", block_value: null, blocked_until: null };
  }
  const value = Number(block_value);
  if (!Number.isInteger(value) || value < 1) {
    throw new AppError(
      type === "days"
        ? "Informe a quantidade de dias de bloqueio."
        : "Informe a quantidade de eventos sem acesso.",
      400,
    );
  }
  if (type === "days" && value > 3650) {
    throw new AppError("O bloqueio por dias deve ser de no máximo 3650.", 400);
  }
  if (type === "events" && value > 500) {
    throw new AppError("O bloqueio por eventos deve ser de no máximo 500.", 400);
  }
  return {
    block_type: type,
    block_value: value,
    blocked_until: computeBlockedUntil(type, value),
  };
}

module.exports = {
  BLOCK_TYPES,
  ERROR_CODE,
  activeBlockJoinSql,
  existsActiveBlockSql,
  eventsElapsedSql,
  computeBlockedUntil,
  formatNotice,
  formatPeriodLabel,
  emptyBlockInfo,
  applyBlocklistFields,
  expireDueBlocks,
  getActiveBlock,
  batchActiveBlockInfo,
  checkBlocklist,
  batchBlocklistedIds,
  throwBlocklistedError,
  assertNotBlocklisted,
  normalizePeriod,
  buildBlockInfo,
};
