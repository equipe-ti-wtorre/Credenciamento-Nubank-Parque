const db = require("../../config/db");
const env = require("../../config/env");
const logger = require("../../config/logger");
const smtpService = require("../smtp/smtp.service");

function resolveAppBaseUrl() {
  if (env.appPublicUrl) return env.appPublicUrl;
  if (env.corsOrigins?.[0]) return String(env.corsOrigins[0]).replace(/\/$/, "");
  return "";
}

function buildEventUrl(idEvent) {
  const base = resolveAppBaseUrl();
  if (!base) return null;
  return `${base}/admin/eventos/${idEvent}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function resolveCompanyEmails(idCompany) {
  const emails = new Set();
  const [contacts] = await db.execute(
    `SELECT email FROM company_contact
      WHERE id_company = ? AND email IS NOT NULL AND TRIM(email) <> ''
      ORDER BY id_company_contact ASC`,
    [idCompany],
  );
  for (const row of contacts) {
    const email = String(row.email || "").trim().toLowerCase();
    if (email) emails.add(email);
  }

  const [users] = await db.execute(
    `SELECT email FROM usuarios
      WHERE id_company = ? AND ativo = 1
        AND email IS NOT NULL AND TRIM(email) <> ''`,
    [idCompany],
  );
  for (const row of users) {
    const email = String(row.email || "").trim().toLowerCase();
    if (email) emails.add(email);
  }

  return [...emails];
}

async function sendCompanyEmails({
  idCompany,
  subject,
  html,
  text,
  usuarioId = null,
  requestId = null,
  context = {},
}) {
  const recipients = await resolveCompanyEmails(idCompany);
  if (!recipients.length) {
    logger.warn(
      { id_company: idCompany, ...context },
      "Sem e-mail de empresa para notificação de evento",
    );
    return { sent: 0, recipients: [] };
  }

  let sent = 0;
  for (const to of recipients) {
    try {
      await smtpService.sendMail({
        to,
        subject,
        html,
        text,
        usuarioId,
        requestId,
      });
      sent += 1;
    } catch (err) {
      logger.warn(
        { err, to, id_company: idCompany, ...context },
        "Falha ao enviar e-mail de evento",
      );
    }
  }
  return { sent, recipients };
}

function schedule(fn) {
  setImmediate(() => {
    Promise.resolve()
      .then(fn)
      .catch((err) => {
        logger.warn({ err }, "Erro em notificação de evento");
      });
  });
}

function notifyEventCreated({
  event,
  idCompanyResponsavel,
  usuarioId = null,
  requestId = null,
}) {
  schedule(async () => {
    const org = env.organizationName || "Credenciamento";
    const link = buildEventUrl(event.id_event);
    const name = escapeHtml(event.name);
    const subject = `Novo evento — ${event.name}`;
    const text = [
      `Olá,`,
      "",
      `A empresa foi definida como responsável pelo evento "${event.name}" no sistema ${org}.`,
      link ? `Acesse: ${link}` : "",
      "",
      "Próximo passo: vincular empresas parceiras e acompanhar o cadastro de colaboradores.",
    ]
      .filter(Boolean)
      .join("\n");
    const html = [
      `<h2>Novo evento</h2>`,
      `<p>A empresa foi definida como responsável pelo evento <strong>${name}</strong>.</p>`,
      `<p>Próximo passo: vincular empresas parceiras e acompanhar o cadastro de colaboradores.</p>`,
      link
        ? `<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#1d54e6;color:#fff;text-decoration:none;border-radius:8px;">Abrir evento</a></p>`
        : "",
    ].join("");

    await sendCompanyEmails({
      idCompany: idCompanyResponsavel,
      subject,
      html,
      text,
      usuarioId,
      requestId,
      context: { tipo: "event.created", id_event: event.id_event },
    });
  });
}

function notifyPartnerLinked({
  event,
  idCompanyPartner,
  partnerName,
  usuarioId = null,
  requestId = null,
}) {
  schedule(async () => {
    const org = env.organizationName || "Credenciamento";
    const link = buildEventUrl(event.id_event);
    const name = escapeHtml(event.name);
    const partner = escapeHtml(partnerName || "sua empresa");
    const subject = `Empresa vinculada ao evento — ${event.name}`;
    const text = [
      `Olá,`,
      "",
      `${partnerName || "Sua empresa"} foi vinculada ao evento "${event.name}" no sistema ${org}.`,
      "Cadastre os colaboradores e, ao concluir, use Notificar término.",
      link ? `Acesse: ${link}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const html = [
      `<h2>Empresa vinculada ao evento</h2>`,
      `<p><strong>${partner}</strong> foi vinculada ao evento <strong>${name}</strong>.</p>`,
      `<p>Cadastre os colaboradores e, ao concluir, use <strong>Notificar término</strong>.</p>`,
      link
        ? `<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#1d54e6;color:#fff;text-decoration:none;border-radius:8px;">Abrir evento</a></p>`
        : "",
    ].join("");

    await sendCompanyEmails({
      idCompany: idCompanyPartner,
      subject,
      html,
      text,
      usuarioId,
      requestId,
      context: { tipo: "event.partner_linked", id_event: event.id_event },
    });
  });
}

function notifyPartnerComplete({
  event,
  idCompanyResponsavel,
  partnerName,
  usuarioId = null,
  requestId = null,
}) {
  schedule(async () => {
    const link = buildEventUrl(event.id_event);
    const name = escapeHtml(event.name);
    const partner = escapeHtml(partnerName || "Empresa parceira");
    const subject = `Cadastro concluído — ${partnerName || "parceira"} — ${event.name}`;
    const text = [
      `Olá,`,
      "",
      `A empresa parceira "${partnerName || "Empresa parceira"}" notificou o término do cadastro de colaboradores no evento "${event.name}".`,
      "Quando estiver pronto, use Notificar para enviar o evento ao setor de aprovação.",
      link ? `Acesse: ${link}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const html = [
      `<h2>Cadastro de colaboradores concluído</h2>`,
      `<p>A empresa parceira <strong>${partner}</strong> notificou o término do cadastro no evento <strong>${name}</strong>.</p>`,
      `<p>Quando estiver pronto, use <strong>Notificar</strong> para enviar o evento ao setor de aprovação.</p>`,
      link
        ? `<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#1d54e6;color:#fff;text-decoration:none;border-radius:8px;">Abrir evento</a></p>`
        : "",
    ].join("");

    await sendCompanyEmails({
      idCompany: idCompanyResponsavel,
      subject,
      html,
      text,
      usuarioId,
      requestId,
      context: { tipo: "event.partner_complete", id_event: event.id_event },
    });
  });
}

module.exports = {
  notifyEventCreated,
  notifyPartnerLinked,
  notifyPartnerComplete,
  resolveCompanyEmails,
  buildEventUrl,
};
