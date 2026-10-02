const db = require("../../config/db");
const env = require("../../config/env");
const logger = require("../../config/logger");
const smtpService = require("../smtp/smtp.service");
const emailTemplatesService = require("../email-templates/email-templates.service");
const {
  emphasis,
  buildLinkNote,
  buildBrandedEmail,
} = require("../email-templates/email-template.layout");

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

function eventUrlLine(link) {
  return link ? `Acesse: ${link}` : "";
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
    const link = buildEventUrl(event.id_event) || "";
    const vars = {
      event_name: event.name,
      organization_name: org,
      event_url: link,
      event_url_line: eventUrlLine(link),
    };

    const rendered = await emailTemplatesService.renderActive("event_created", vars);
    const name = escapeHtml(event.name);
    const subject = rendered?.subject || `Novo evento — ${event.name}`;
    const text =
      rendered?.text ||
      [
        `Olá,`,
        "",
        `A empresa foi definida como responsável pelo evento "${event.name}" no sistema ${org}.`,
        link ? `Acesse: ${link}` : "",
        "",
        "Próximo passo: vincular empresas parceiras e acompanhar o cadastro de colaboradores.",
      ]
        .filter(Boolean)
        .join("\n");
    const safeLink = escapeHtml(link);
    const html =
      rendered?.html ||
      buildBrandedEmail({
        preheader: `A empresa foi definida como responsável pelo evento ${name} no Credenciamento do Nubank Parque.`,
        title: "Novo evento",
        kicker: "Notificação de evento",
        paragraphs: [
          "Olá,",
          `A empresa foi definida como responsável pelo evento ${emphasis(name)}.`,
          "Próximo passo: vincular empresas parceiras e acompanhar o cadastro de colaboradores.",
        ],
        cta: link ? { href: safeLink, label: "Abrir evento" } : null,
        noteHtml: link ? buildLinkNote({ url: safeLink }) : null,
      });

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
    const link = buildEventUrl(event.id_event) || "";
    const vars = {
      event_name: event.name,
      organization_name: org,
      partner_name: partnerName || "sua empresa",
      event_url: link,
      event_url_line: eventUrlLine(link),
    };

    const rendered = await emailTemplatesService.renderActive(
      "event_partner_linked",
      vars,
    );
    const name = escapeHtml(event.name);
    const partner = escapeHtml(partnerName || "sua empresa");
    const subject =
      rendered?.subject || `Empresa vinculada ao evento — ${event.name}`;
    const text =
      rendered?.text ||
      [
        `Olá,`,
        "",
        `${partnerName || "Sua empresa"} foi vinculada ao evento "${event.name}" no sistema ${org}.`,
        "Cadastre os colaboradores e, ao concluir, use Notificar término.",
        link ? `Acesse: ${link}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    const safeLink = escapeHtml(link);
    const html =
      rendered?.html ||
      buildBrandedEmail({
        preheader: `${partner} foi vinculada ao evento ${name}.`,
        title: "Empresa vinculada ao evento",
        kicker: "Notificação de evento",
        paragraphs: [
          "Olá,",
          `${emphasis(partner)} foi vinculada ao evento ${emphasis(name)}.`,
          `Cadastre os colaboradores e, ao concluir, use ${emphasis("Notificar término")}.`,
        ],
        cta: link ? { href: safeLink, label: "Abrir evento" } : null,
        noteHtml: link ? buildLinkNote({ url: safeLink }) : null,
      });

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
    const link = buildEventUrl(event.id_event) || "";
    const vars = {
      event_name: event.name,
      partner_name: partnerName || "Empresa parceira",
      event_url: link,
      event_url_line: eventUrlLine(link),
    };

    const rendered = await emailTemplatesService.renderActive(
      "event_partner_complete",
      vars,
    );
    const name = escapeHtml(event.name);
    const partner = escapeHtml(partnerName || "Empresa parceira");
    const subject =
      rendered?.subject ||
      `Cadastro concluído — ${partnerName || "parceira"} — ${event.name}`;
    const text =
      rendered?.text ||
      [
        `Olá,`,
        "",
        `A empresa parceira "${partnerName || "Empresa parceira"}" notificou o término do cadastro de colaboradores no evento "${event.name}".`,
        "Quando estiver pronto, use Notificar para enviar o evento ao setor de aprovação.",
        link ? `Acesse: ${link}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    const safeLink = escapeHtml(link);
    const html =
      rendered?.html ||
      buildBrandedEmail({
        preheader: `${partner} concluiu o cadastro de colaboradores no evento ${name}.`,
        title: "Cadastro de colaboradores concluído",
        kicker: "Notificação de evento",
        paragraphs: [
          "Olá,",
          `A empresa parceira ${emphasis(partner)} notificou o término do cadastro no evento ${emphasis(name)}.`,
          `Quando estiver pronto, use ${emphasis("Notificar")} para enviar o evento ao setor de aprovação.`,
        ],
        cta: link ? { href: safeLink, label: "Abrir evento" } : null,
        noteHtml: link ? buildLinkNote({ url: safeLink }) : null,
      });

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
