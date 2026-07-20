const { EmailClient } = require("@azure/communication-email");
const nodemailer = require("nodemailer");
const db = require("../../config/db");
const { child } = require("../../config/logger");
const AppError = require("../../utils/AppError");
const emailConfigService = require("./email-config.service");
const {
  acsRateLimit,
  applyOcultarPara,
  htmlToPlainText,
  sendMailBatched: batchHelper,
} = require("./email-sender.helpers");

const logger = child({ module: "emailSender" });

async function getSmtpSettingsForSend() {
  const [rows] = await db.execute(
    `SELECT * FROM smtp_settings WHERE ativo = 1 ORDER BY id DESC LIMIT 1`,
  );
  const row = rows[0];
  if (!row || !row.password_ciphertext) return null;

  const { decrypt } = require("../../config/cryptoSecrets");
  let password;
  try {
    password = decrypt(row.password_ciphertext);
  } catch {
    return null;
  }

  return {
    host: row.host,
    port: row.port,
    secure: !!row.secure,
    user: row.user,
    password,
    from_email: row.from_email,
    from_name: row.from_name,
  };
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
  messageId,
  provider,
}) {
  await db.execute(
    `INSERT INTO smtp_send_logs
      (destinatario, assunto, corpo_resumo, status, erro_mensagem, usuario_id, request_id, message_id, provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      destinatario,
      assunto,
      corpoResumo ? String(corpoResumo).slice(0, 500) : null,
      status,
      erroMensagem || null,
      usuarioId || null,
      requestId || null,
      messageId || null,
      provider || null,
    ],
  );
}

async function updateDeliveryStatus(messageId, status) {
  if (!messageId) return 0;
  const [result] = await db.execute(
    `UPDATE smtp_send_logs SET status = ? WHERE message_id = ? AND status IN ('sent', 'entregue', 'bounce')`,
    [status, messageId],
  );
  return result.affectedRows || 0;
}

async function sendViaSmtp(opts, providerConfig) {
  const config = await getSmtpSettingsForSend();
  if (!config) {
    throw new AppError(
      "Configuração SMTP ativa não encontrada ou sem senha.",
      400,
    );
  }

  const transporter = createTransporter(config);
  const from = config.from_name
    ? `"${config.from_name}" <${config.from_email}>`
    : config.from_email;

  const { to, bcc } = applyOcultarPara({
    to: opts.to,
    from: config.from_email,
    ocultarPara: providerConfig.ocultar_para,
  });

  const info = await transporter.sendMail({
    from,
    to,
    bcc,
    subject: opts.subject,
    text: opts.text || undefined,
    html: opts.html || undefined,
    attachments: opts.attachments || undefined,
  });

  return {
    provider: "smtp",
    messageId: info.messageId || null,
    raw: info,
  };
}

async function sendViaAcs(opts, providerConfig) {
  await acsRateLimit(opts.onAcsWait);

  const client = new EmailClient(providerConfig.acs_connection_string);
  const sender = providerConfig.acs_sender;

  const { to, bcc } = applyOcultarPara({
    to: opts.to,
    from: sender,
    ocultarPara: providerConfig.ocultar_para,
  });

  const toList = Array.isArray(to) ? to : [to];
  const recipients = {
    to: toList.map((address) => ({ address })),
  };
  if (bcc) {
    const bccList = Array.isArray(bcc) ? bcc : [bcc];
    recipients.bcc = bccList.map((address) => ({ address }));
  }

  const plainText = opts.text || htmlToPlainText(opts.html) || opts.subject || "";

  const message = {
    senderAddress: sender,
    content: {
      subject: opts.subject,
      plainText,
      ...(opts.html ? { html: opts.html } : {}),
    },
    recipients,
  };

  if (opts.attachments?.length) {
    message.attachments = opts.attachments.map((a) => ({
      name: a.filename || a.name || "attachment",
      contentType: a.contentType || a.content_type || "application/octet-stream",
      contentInBase64: Buffer.isBuffer(a.content)
        ? a.content.toString("base64")
        : a.contentInBase64 || a.content,
    }));
  }

  const poller = await client.beginSend(message);
  const result = await poller.pollUntilDone();
  const messageId = result?.id || result?.messageId || null;

  return {
    provider: "acs",
    messageId,
    raw: result,
  };
}

/**
 * Unified email send. Chooses SMTP or Azure ACS from email_provider_config.
 *
 * @param {object} opts
 * @param {string|string[]} opts.to
 * @param {string} opts.subject
 * @param {string} [opts.html]
 * @param {string} [opts.text]
 * @param {Array} [opts.attachments]
 * @param {number} [opts.usuarioId]
 * @param {string} [opts.requestId]
 * @param {(enviarEm: Date, waitMs: number, motivo: string|null) => void|Promise<void>} [opts.onAcsWait]
 */
async function sendEmail(opts) {
  const providerConfig = await emailConfigService.assertCanSend();

  let result;
  try {
    if (providerConfig.provider === "acs") {
      result = await sendViaAcs(opts, providerConfig);
    } else {
      const smtpReady = await getSmtpSettingsForSend();
      if (!smtpReady) {
        throw new AppError(
          "Configuração SMTP ativa não encontrada ou sem senha.",
          400,
        );
      }
      result = await sendViaSmtp(opts, providerConfig);
    }

    await insertSendLog({
      destinatario: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
      assunto: opts.subject,
      corpoResumo: opts.text || opts.html,
      status: "sent",
      usuarioId: opts.usuarioId,
      requestId: opts.requestId,
      messageId: result.messageId,
      provider: result.provider,
    });

    return result;
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error({ err }, "Falha ao enviar e-mail");
    }

    try {
      await insertSendLog({
        destinatario: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
        assunto: opts.subject,
        corpoResumo: opts.text || opts.html,
        status: "failed",
        erroMensagem: err.message,
        usuarioId: opts.usuarioId,
        requestId: opts.requestId,
        provider: providerConfig.provider,
      });
    } catch (logErr) {
      logger.error({ err: logErr }, "Falha ao gravar log de e-mail");
    }

    throw err;
  }
}

async function sendMailBatched(items, mapItemToOpts) {
  const providerConfig = await emailConfigService.getConfigForSend();
  const isAcs = providerConfig?.provider === "acs";

  return batchHelper(
    items,
    async (item, index) => {
      const opts =
        typeof mapItemToOpts === "function" ? mapItemToOpts(item, index) : item;
      return sendEmail(opts);
    },
    { isAcs },
  );
}

async function getMailSender() {
  const config = await emailConfigService.getConfigForSend();
  if (!config) return null;
  if (config.provider === "acs") return config.acs_sender;
  const smtp = await getSmtpSettingsForSend();
  return smtp?.from_email || null;
}

async function verifySmtpConnection() {
  const config = await getSmtpSettingsForSend();
  if (!config) {
    throw new AppError(
      "Configuração SMTP ativa não encontrada ou sem senha.",
      400,
    );
  }
  const transporter = createTransporter(config);
  await transporter.verify();
  return { ok: true };
}

module.exports = {
  sendEmail,
  sendMailBatched,
  getMailSender,
  updateDeliveryStatus,
  verifySmtpConnection,
  insertSendLog,
  getSmtpSettingsForSend,
  createTransporter,
};
