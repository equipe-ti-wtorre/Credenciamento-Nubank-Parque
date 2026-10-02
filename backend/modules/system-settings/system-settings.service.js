const db = require("../../config/db");
const { SQL_HAS_DEPARTMENT } = require("../../utils/userDepartment");

const { toSqlTime, formatHm, crossesMidnight } = require("../../utils/accessSchedule");

const DEFAULT_IDLE_MINUTES = 30;
const MIN_IDLE_MINUTES = 5;
const MAX_IDLE_MINUTES = 480;

const COLOR_PALETTES = ["wtorre", "nubank-parque"];
const DEFAULT_COLOR_PALETTE = "wtorre";

async function ensureRow() {
  const [rows] = await db.execute("SELECT id FROM system_settings LIMIT 1");
  if (rows.length === 0) {
    await db.execute(
      "INSERT INTO system_settings (session_idle_minutes, color_palette) VALUES (?, ?)",
      [DEFAULT_IDLE_MINUTES, DEFAULT_COLOR_PALETTE],
    );
  }
}

function normalizePalette(value) {
  return COLOR_PALETTES.includes(value) ? value : DEFAULT_COLOR_PALETTE;
}

async function getSessionSettings() {
  await ensureRow();
  const [rows] = await db.execute(
    "SELECT id, session_idle_minutes, atualizado_em FROM system_settings ORDER BY id ASC LIMIT 1",
  );
  const row = rows[0];
  return {
    id: row.id,
    session_idle_minutes: row.session_idle_minutes,
    atualizado_em: row.atualizado_em,
  };
}

async function updateSessionSettings(sessionIdleMinutes) {
  await ensureRow();
  const minutes = Math.min(
    MAX_IDLE_MINUTES,
    Math.max(MIN_IDLE_MINUTES, sessionIdleMinutes),
  );
  const [existing] = await db.execute("SELECT id FROM system_settings ORDER BY id ASC LIMIT 1");
  await db.execute("UPDATE system_settings SET session_idle_minutes = ? WHERE id = ?", [
    minutes,
    existing[0].id,
  ]);
  return getSessionSettings();
}

async function getAppearanceSettings() {
  await ensureRow();
  const [rows] = await db.execute(
    "SELECT id, color_palette, atualizado_em FROM system_settings ORDER BY id ASC LIMIT 1",
  );
  const row = rows[0];
  return {
    id: row.id,
    color_palette: normalizePalette(row.color_palette),
    atualizado_em: row.atualizado_em,
  };
}

async function updateAppearanceSettings(colorPalette) {
  await ensureRow();
  const palette = normalizePalette(colorPalette);
  const [existing] = await db.execute("SELECT id FROM system_settings ORDER BY id ASC LIMIT 1");
  await db.execute("UPDATE system_settings SET color_palette = ? WHERE id = ?", [
    palette,
    existing[0].id,
  ]);
  return getAppearanceSettings();
}

async function getEventAccreditationNotifySettings() {
  await ensureRow();
  const [rows] = await db.execute(
    `SELECT id, ea_internal_notify_all, atualizado_em FROM system_settings ORDER BY id ASC LIMIT 1`,
  );
  const row = rows[0];
  const [users] = await db.execute(
    `SELECT u.id, u.nome_completo, u.email, u.departamento
       FROM event_accreditation_internal_notify_user n
       INNER JOIN usuarios u ON u.id = n.id_usuario
      WHERE u.ativo = 1
      ORDER BY u.nome_completo ASC`,
  );
  return {
    id: row.id,
    notify_all: !!Number(row.ea_internal_notify_all),
    users: users.map((u) => ({
      id: Number(u.id),
      nome_completo: u.nome_completo,
      email: u.email,
      departamento: u.departamento || null,
    })),
    atualizado_em: row.atualizado_em,
  };
}

async function updateEventAccreditationNotifySettings({ notify_all, user_ids }) {
  await ensureRow();
  const [existing] = await db.execute("SELECT id FROM system_settings ORDER BY id ASC LIMIT 1");
  await db.execute("UPDATE system_settings SET ea_internal_notify_all = ? WHERE id = ?", [
    notify_all ? 1 : 0,
    existing[0].id,
  ]);
  const uniqueIds = [...new Set((user_ids || []).map(Number).filter((id) => id > 0))];
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM event_accreditation_internal_notify_user");
    if (uniqueIds.length) {
      const placeholders = uniqueIds.map(() => "?").join(",");
      const [valid] = await conn.execute(
        `SELECT u.id
           FROM usuarios u
           LEFT JOIN perfis p ON p.id = u.id_perfil
          WHERE u.id IN (${placeholders})
            AND u.ativo = 1
            AND u.is_ad_user = 1
            AND u.id_company IS NULL
            AND (p.requires_company IS NULL OR p.requires_company = 0)
            AND ${SQL_HAS_DEPARTMENT.replace(/departamento/g, "u.departamento")}`,
        uniqueIds,
      );
      for (const row of valid) {
        await conn.execute(
          "INSERT INTO event_accreditation_internal_notify_user (id_usuario) VALUES (?)",
          [row.id],
        );
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getEventAccreditationNotifySettings();
}

async function listAdInternalUsers({ search = "" } = {}) {
  const params = [];
  let extra = "";
  if (search && String(search).trim()) {
    extra = " AND (u.nome_completo LIKE ? OR u.email LIKE ? OR u.username LIKE ?)";
    const term = `%${String(search).trim()}%`;
    params.push(term, term, term);
  }
  const [rows] = await db.execute(
    `SELECT u.id, u.nome_completo, u.email, u.departamento
       FROM usuarios u
       LEFT JOIN perfis p ON p.id = u.id_perfil
      WHERE u.ativo = 1
        AND u.is_ad_user = 1
        AND u.id_company IS NULL
        AND (p.requires_company IS NULL OR p.requires_company = 0)
        AND ${SQL_HAS_DEPARTMENT.replace(/departamento/g, "u.departamento")}
        ${extra}
      ORDER BY u.nome_completo ASC`,
    params,
  );
  return rows.map((u) => ({
    id: Number(u.id),
    nome_completo: u.nome_completo,
    email: u.email,
    departamento: u.departamento || null,
  }));
}

const DEFAULT_ACCESS_SCHEDULE = {
  comercial_start: "08:00",
  comercial_end: "18:00",
  noturno_start: "18:00",
  noturno_end: "08:00",
};

function mapAccessScheduleRow(row) {
  return {
    id: row.id,
    comercial_start: formatHm(row.comercial_start) || DEFAULT_ACCESS_SCHEDULE.comercial_start,
    comercial_end: formatHm(row.comercial_end) || DEFAULT_ACCESS_SCHEDULE.comercial_end,
    noturno_start: formatHm(row.noturno_start) || DEFAULT_ACCESS_SCHEDULE.noturno_start,
    noturno_end: formatHm(row.noturno_end) || DEFAULT_ACCESS_SCHEDULE.noturno_end,
    comercial_crosses_midnight: crossesMidnight(row.comercial_start, row.comercial_end),
    noturno_crosses_midnight: crossesMidnight(row.noturno_start, row.noturno_end),
    atualizado_em: row.atualizado_em,
  };
}

async function getAccessScheduleSettings() {
  await ensureRow();
  const [rows] = await db.execute(
    `SELECT id, comercial_start, comercial_end, noturno_start, noturno_end, atualizado_em
       FROM system_settings ORDER BY id ASC LIMIT 1`,
  );
  return mapAccessScheduleRow(rows[0]);
}

async function updateAccessScheduleSettings(data) {
  await ensureRow();
  const comercialStart = toSqlTime(data.comercial_start);
  const comercialEnd = toSqlTime(data.comercial_end);
  const noturnoStart = toSqlTime(data.noturno_start);
  const noturnoEnd = toSqlTime(data.noturno_end);
  const [existing] = await db.execute("SELECT id FROM system_settings ORDER BY id ASC LIMIT 1");
  await db.execute(
    `UPDATE system_settings
        SET comercial_start = ?, comercial_end = ?, noturno_start = ?, noturno_end = ?
      WHERE id = ?`,
    [comercialStart, comercialEnd, noturnoStart, noturnoEnd, existing[0].id],
  );
  return getAccessScheduleSettings();
}

module.exports = {
  getSessionSettings,
  updateSessionSettings,
  getAppearanceSettings,
  updateAppearanceSettings,
  getEventAccreditationNotifySettings,
  updateEventAccreditationNotifySettings,
  listAdInternalUsers,
  getAccessScheduleSettings,
  updateAccessScheduleSettings,
  DEFAULT_IDLE_MINUTES,
  MIN_IDLE_MINUTES,
  MAX_IDLE_MINUTES,
  COLOR_PALETTES,
  DEFAULT_COLOR_PALETTE,
};
