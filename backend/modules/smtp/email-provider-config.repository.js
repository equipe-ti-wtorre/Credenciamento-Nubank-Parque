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
 * @param {string|null|undefined} [fields.sendgrid_api_key_ciphertext] — undefined = keep; null = clear
 * @param {string|null} [fields.sendgrid_from_email]
 * @param {string|null} [fields.sendgrid_from_name]
 * @param {string|null|undefined} [fields.sendgrid_webhook_verification_key_ciphertext] — undefined = keep; null = clear
 * @param {boolean} [fields.ocultar_para]
 * @param {boolean} [fields.ativo]
 */
async function update(fields) {
  await ensureRow();
  const current = await getRow();

  const provider = fields.provider !== undefined ? fields.provider : current.provider;
  const acsSender =
    fields.acs_sender !== undefined ? fields.acs_sender : current.acs_sender;
  const sendgridFromEmail =
    fields.sendgrid_from_email !== undefined
      ? fields.sendgrid_from_email
      : current.sendgrid_from_email;
  const sendgridFromName =
    fields.sendgrid_from_name !== undefined
      ? fields.sendgrid_from_name
      : current.sendgrid_from_name;
  const ocultarPara =
    fields.ocultar_para !== undefined
      ? fields.ocultar_para
        ? 1
        : 0
      : current.ocultar_para;
  const ativo =
    fields.ativo !== undefined ? (fields.ativo ? 1 : 0) : current.ativo;

  let acsCiphertext = current.acs_connection_string_ciphertext;
  if (fields.acs_connection_string_ciphertext !== undefined) {
    acsCiphertext = fields.acs_connection_string_ciphertext;
  }

  let sendgridCiphertext = current.sendgrid_api_key_ciphertext;
  if (fields.sendgrid_api_key_ciphertext !== undefined) {
    sendgridCiphertext = fields.sendgrid_api_key_ciphertext;
  }

  let sendgridWebhookKeyCiphertext =
    current.sendgrid_webhook_verification_key_ciphertext;
  if (fields.sendgrid_webhook_verification_key_ciphertext !== undefined) {
    sendgridWebhookKeyCiphertext =
      fields.sendgrid_webhook_verification_key_ciphertext;
  }

  await db.execute(
    `UPDATE email_provider_config
     SET provider = ?, acs_connection_string_ciphertext = ?, acs_sender = ?,
         sendgrid_api_key_ciphertext = ?, sendgrid_from_email = ?, sendgrid_from_name = ?,
         sendgrid_webhook_verification_key_ciphertext = ?,
         ocultar_para = ?, ativo = ?
     WHERE id = ?`,
    [
      provider,
      acsCiphertext,
      acsSender || null,
      sendgridCiphertext,
      sendgridFromEmail || null,
      sendgridFromName || null,
      sendgridWebhookKeyCiphertext,
      ocultarPara,
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
