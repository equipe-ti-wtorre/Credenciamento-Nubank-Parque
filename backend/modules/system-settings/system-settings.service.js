const db = require("../../config/db");

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

module.exports = {
  getSessionSettings,
  updateSessionSettings,
  getAppearanceSettings,
  updateAppearanceSettings,
  DEFAULT_IDLE_MINUTES,
  MIN_IDLE_MINUTES,
  MAX_IDLE_MINUTES,
  COLOR_PALETTES,
  DEFAULT_COLOR_PALETTE,
};
