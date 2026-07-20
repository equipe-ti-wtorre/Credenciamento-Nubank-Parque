const db = require("../../config/db");

const SINGLETON_ID = 1;

async function getRow() {
  const [rows] = await db.execute(
    `SELECT * FROM email_provider_config WHERE id = ? LIMIT 1`,
    [SINGLETON_ID],
  );
  return rows[0] || null;
}

async function ensureRow() {
  const existing = await getRow();
  if (existing) return existing;

  await db.execute(
    `INSERT INTO email_provider_config (id, provider, ocultar_para, ativo)
     VALUES (?, 'smtp', 0, 1)
     ON DUPLICATE KEY UPDATE id = id`,
    [SINGLETON_ID],
  );
  return getRow();
}

/**
 * @param {object} fields
 * @param {string} [fields.provider]
 * @param {string|null|undefined} [fields.acs_connection_string_ciphertext] — undefined = keep; null = clear
 * @param {string|null} [fields.acs_sender]
 * @param {boolean} [fields.ocultar_para]
 * @param {boolean} [fields.ativo]
 */
async function update(fields) {
  await ensureRow();
  const current = await getRow();

  const provider = fields.provider !== undefined ? fields.provider : current.provider;
  const acsSender =
    fields.acs_sender !== undefined ? fields.acs_sender : current.acs_sender;
  const ocultarPara =
    fields.ocultar_para !== undefined
      ? fields.ocultar_para
        ? 1
        : 0
      : current.ocultar_para;
  const ativo =
    fields.ativo !== undefined ? (fields.ativo ? 1 : 0) : current.ativo;

  let ciphertext = current.acs_connection_string_ciphertext;
  if (fields.acs_connection_string_ciphertext !== undefined) {
    ciphertext = fields.acs_connection_string_ciphertext;
  }

  await db.execute(
    `UPDATE email_provider_config
     SET provider = ?, acs_connection_string_ciphertext = ?, acs_sender = ?,
         ocultar_para = ?, ativo = ?
     WHERE id = ?`,
    [provider, ciphertext, acsSender || null, ocultarPara, ativo, SINGLETON_ID],
  );

  return getRow();
}

module.exports = {
  SINGLETON_ID,
  getRow,
  ensureRow,
  update,
};
