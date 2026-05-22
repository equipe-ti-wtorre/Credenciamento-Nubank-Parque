const nodemailer = require("nodemailer");
const db = require("../../config/db");
const { encrypt, decrypt } = require("../../config/cryptoSecrets");
const { child } = require("../../config/logger");

const logger = child({ module: "smtp" });

function mapSettingsRow(row, includePassword = false) {
  if (!row) return null;
  const base = {
    id: row.id,
    host: row.host,
    port: row.port,
    secure: !!row.secure,
    user: row.user,
    from_email: row.from_email,
    from_name: row.from_name,
    ativo: !!row.ativo,
    hasPassword: !!row.password_ciphertext,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
  if (includePassword && row.password_ciphertext) {
    try {
      base.password = decrypt(row.password_ciphertext);
    } catch {
      base.password = null;
    }
  }
  return base;
}

async function getActiveSettingsRow() {
  const [rows] = await db.execute(
    `SELECT * FROM smtp_settings WHERE ativo = 1 ORDER BY id DESC LIMIT 1`,
  );
  return rows[0] || null;
}

async function getSettings() {
  const row = await getActiveSettingsRow();
  if (!row) {
    const [any] = await db.execute(`SELECT * FROM smtp_settings ORDER BY id DESC LIMIT 1`);
    return mapSettingsRow(any[0] || null);
  }
  return mapSettingsRow(row);
}

async function getSettingsForSend() {
  const row = await getActiveSettingsRow();
  if (!row || !row.password_ciphertext) return null;
  return mapSettingsRow(row, true);
}

async function upsertSettings(data) {
  const existing = await getActiveSettingsRow();
  const ciphertext =
    data.password !== undefined && data.password !== ""
      ? encrypt(data.password)
      : undefined;

  if (existing) {
    let passwordField = existing.password_ciphertext;
    if (ciphertext !== undefined) passwordField = ciphertext;

    await db.execute(
      `UPDATE smtp_settings SET host=?, port=?, secure=?, user=?, password_ciphertext=?, from_email=?, from_name=?, ativo=? WHERE id=?`,
      [
        data.host,
        data.port,
        data.secure ? 1 : 0,
        data.user,
        passwordField,
        data.from_email,
        data.from_name || null,
        data.ativo !== false ? 1 : 0,
        existing.id,
      ],
    );
    const [rows] = await db.execute("SELECT * FROM smtp_settings WHERE id = ?", [existing.id]);
    return mapSettingsRow(rows[0]);
  }

  if (!data.password) {
    throw new Error("Senha SMTP é obrigatória na primeira configuração.");
  }

  const [result] = await db.execute(
    `INSERT INTO smtp_settings (host, port, secure, user, password_ciphertext, from_email, from_name, ativo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.host,
      data.port,
      data.secure ? 1 : 0,
      data.user,
      encrypt(data.password),
      data.from_email,
      data.from_name || null,
      data.ativo !== false ? 1 : 0,
    ],
  );
  const [rows] = await db.execute("SELECT * FROM smtp_settings WHERE id = ?", [result.insertId]);
  return mapSettingsRow(rows[0]);
}

function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });
}

async function insertSendLog({
  destinatario,
  assunto,
  corpoResumo,
  status,
  erroMensagem,
  usuarioId,
  requestId,
}) {
  await db.execute(
    `INSERT INTO smtp_send_logs (destinatario, assunto, corpo_resumo, status, erro_mensagem, usuario_id, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      destinatario,
      assunto,
      corpoResumo ? String(corpoResumo).slice(0, 500) : null,
      status,
      erroMensagem || null,
      usuarioId || null,
      requestId || null,
    ],
  );
}

async function sendMail({ to, subject, text, html, usuarioId, requestId }) {
  const config = await getSettingsForSend();
  if (!config) {
    throw new Error("Configuração SMTP ativa não encontrada ou sem senha.");
  }

  const transporter = createTransporter(config);
  const from = config.from_name
    ? `"${config.from_name}" <${config.from_email}>`
    : config.from_email;

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
    });

    await insertSendLog({
      destinatario: to,
      assunto: subject,
      corpoResumo: text || html,
      status: "sent",
      usuarioId,
      requestId,
    });

    return { success: true };
  } catch (err) {
    logger.error({ err }, "Falha ao enviar e-mail SMTP");
    await insertSendLog({
      destinatario: to,
      assunto: subject,
      corpoResumo: text || html,
      status: "failed",
      erroMensagem: err.message,
      usuarioId,
      requestId,
    });
    throw err;
  }
}

async function listLogs({ page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const [rows] = await db.execute(
    `SELECT id, destinatario, assunto, corpo_resumo, status, erro_mensagem, usuario_id, request_id, criado_em
     FROM smtp_send_logs ORDER BY criado_em DESC LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM smtp_send_logs`);
  return {
    logs: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

module.exports = {
  getSettings,
  upsertSettings,
  sendMail,
  listLogs,
};
