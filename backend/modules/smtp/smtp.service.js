const db = require("../../config/db");
const { encrypt, decrypt } = require("../../config/cryptoSecrets");
const emailConfigService = require("./email-config.service");
const emailSender = require("./emailSender");
const AppError = require("../../utils/AppError");

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

async function getLatestSettingsRow() {
  const active = await getActiveSettingsRow();
  if (active) return active;
  const [any] = await db.execute(`SELECT * FROM smtp_settings ORDER BY id DESC LIMIT 1`);
  return any[0] || null;
}

/**
 * Combined public settings: SMTP row + email provider config.
 */
async function getSettings() {
  const row = await getLatestSettingsRow();
  const smtp = mapSettingsRow(row);
  const provider = await emailConfigService.getPublicConfig();

  return {
    ...(smtp || {
      host: "",
      port: 587,
      secure: false,
      user: "",
      from_email: "",
      from_name: null,
      ativo: true,
      hasPassword: false,
    }),
    provider: provider.provider,
    acs_sender: provider.acs_sender,
    has_acs_connection_string: provider.has_acs_connection_string,
    ocultar_para: provider.ocultar_para,
    email_ativo: provider.ativo,
  };
}

async function getSettingsForSend() {
  return emailSender.getSmtpSettingsForSend();
}

async function upsertSmtpSettings(data) {
  const existing = await getLatestSettingsRow();
  const ciphertext =
    data.password !== undefined && data.password !== ""
      ? encrypt(data.password)
      : undefined;

  if (existing) {
    let passwordField = existing.password_ciphertext;
    if (ciphertext !== undefined) passwordField = ciphertext;

    const smtpAtivo =
      data.smtp_ativo !== undefined
        ? data.smtp_ativo !== false
        : data.ativo !== undefined
          ? data.ativo !== false
          : !!existing.ativo;

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
        smtpAtivo ? 1 : 0,
        existing.id,
      ],
    );
    const [rows] = await db.execute("SELECT * FROM smtp_settings WHERE id = ?", [
      existing.id,
    ]);
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
  const [rows] = await db.execute("SELECT * FROM smtp_settings WHERE id = ?", [
    result.insertId,
  ]);
  return mapSettingsRow(rows[0]);
}

/**
 * Save SMTP fields (when provided) + provider config.
 */
async function upsertSettings(data) {
  const providerFields = {
    provider: data.provider,
    acs_connection_string: data.acs_connection_string,
    acs_sender: data.acs_sender,
    ocultar_para: data.ocultar_para,
    ativo: data.email_ativo !== undefined ? data.email_ativo : data.ativo_email,
  };

  // email_ativo takes precedence; fallback to top-level ativo only when saving provider-only flags
  if (providerFields.ativo === undefined && data.email_ativo === undefined) {
    // Keep provider ativo unchanged unless explicitly set via email_ativo / ativo_email
    delete providerFields.ativo;
  }

  const hasSmtpPayload =
    data.host !== undefined &&
    data.port !== undefined &&
    data.user !== undefined &&
    data.from_email !== undefined;

  if (hasSmtpPayload) {
    await upsertSmtpSettings(data);
  }

  const hasProviderPayload =
    data.provider !== undefined ||
    data.acs_connection_string !== undefined ||
    data.acs_sender !== undefined ||
    data.ocultar_para !== undefined ||
    data.email_ativo !== undefined ||
    data.ativo_email !== undefined;

  if (hasProviderPayload) {
    const clean = { ...providerFields };
    Object.keys(clean).forEach((k) => {
      if (clean[k] === undefined) delete clean[k];
    });
    if (Object.keys(clean).length) {
      await emailConfigService.saveProviderConfig(clean);
    }
  }

  // Validate ACS readiness when selecting ACS as active provider
  const after = await getSettings();
  if (after.provider === "acs" && after.email_ativo) {
    if (!after.acs_sender) {
      throw new AppError("Remetente ACS (acs_sender) é obrigatório.", 400);
    }
    if (!after.has_acs_connection_string) {
      throw new AppError(
        "Connection string ACS é obrigatória na primeira configuração.",
        400,
      );
    }
  }

  return after;
}

async function sendMail({ to, subject, text, html, usuarioId, requestId, attachments, onAcsWait }) {
  return emailSender.sendEmail({
    to,
    subject,
    text,
    html,
    attachments,
    usuarioId,
    requestId,
    onAcsWait,
  });
}

async function verifyConnection() {
  return emailSender.verifySmtpConnection();
}

async function listLogs({ page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const [rows] = await db.execute(
    `SELECT id, destinatario, assunto, corpo_resumo, status, erro_mensagem, usuario_id, request_id,
            message_id, provider, criado_em
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
  verifyConnection,
  getSettingsForSend,
  mapSettingsRow,
};
