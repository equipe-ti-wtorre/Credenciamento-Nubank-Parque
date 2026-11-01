const db = require("../../config/db");

const SINGLETON_ID = 1;

async function getRow() {
  const [rows] = await db.execute(
    `SELECT * FROM whatsapp_provider_config WHERE id = ? LIMIT 1`,
    [SINGLETON_ID],
  );
  return rows[0] || null;
}

async function ensureRow() {
  const existing = await getRow();
  if (existing) return existing;

  await db.execute(
    `INSERT INTO whatsapp_provider_config (id, provider, default_country_code, ativo)
     VALUES (?, 'openwa', '55', 0)
     ON DUPLICATE KEY UPDATE id = id`,
    [SINGLETON_ID],
  );
  return getRow();
}

/**
 * @param {object} fields
 * @param {string} [fields.provider]
 * @param {string|null} [fields.base_url]
 * @param {string|null|undefined} [fields.api_key_ciphertext] — undefined = keep; null = clear
 * @param {string|null} [fields.session_id]
 * @param {string} [fields.default_country_code]
 * @param {boolean} [fields.ativo]
 */
async function update(fields) {
  await ensureRow();
  const current = await getRow();

  const pick = (key, fallback) =>
    fields[key] !== undefined ? fields[key] : fallback;

  const provider = pick("provider", current.provider || "openwa");
  const baseUrl = pick("base_url", current.base_url);
  const sessionId = pick("session_id", current.session_id);
  const defaultCountryCode = pick(
    "default_country_code",
    current.default_country_code || "55",
  );
  const ativo =
    fields.ativo !== undefined ? (fields.ativo ? 1 : 0) : current.ativo;
  const apiKeyCiphertext = pick("api_key_ciphertext", current.api_key_ciphertext);

  await db.execute(
    `UPDATE whatsapp_provider_config
     SET provider = ?, base_url = ?, api_key_ciphertext = ?, session_id = ?,
         default_country_code = ?, ativo = ?
     WHERE id = ?`,
    [
      provider,
      baseUrl || null,
      apiKeyCiphertext,
      sessionId || null,
      defaultCountryCode,
      ativo,
      SINGLETON_ID,
    ],
  );

  return getRow();
}

module.exports = {
  SINGLETON_ID,
  getRow,
  ensureRow,
  update,
};
