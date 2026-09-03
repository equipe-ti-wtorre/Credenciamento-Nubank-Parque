const fs = require("fs");
const path = require("path");
const db = require("../../config/db");
const env = require("../../config/env");
const { logger } = require("../../config/logger");
const smtpService = require("../smtp/smtp.service");
const alertsService = require("../alerts/alerts.service");
const teamsService = require("../teams/teams.service");
const { buildInfoCard } = require("../teams/adaptiveCards");
const { normalizeHttpsAppUrl } = require("../../utils/microsoftGraph");
const { SQL_HAS_DEPARTMENT } = require("../../utils/userDepartment");

const COVER_DIR = path.join(__dirname, "../../storage/event-accreditation-covers");
const INVITE_FILE_DIR = path.join(__dirname, "../../storage/event-accreditation-invite-files");

function resolveAppBaseUrl() {
  if (env.appPublicUrl) return env.appPublicUrl;
  if (env.corsOrigins?.[0]) return String(env.corsOrigins[0]).replace(/\/$/, "");
  return "";
}

function buildItemUrl(id) {
  const base = resolveAppBaseUrl();
  if (!base) return null;
  return `${base}/admin/credenciamento-eventos/${id}`;
}

function buildTeamsItemUrl(id) {
  const path = `/credenciamento-eventos/${id}`;
  const base =
    normalizeHttpsAppUrl(env.teamsActivityWebUrl) ||
    normalizeHttpsAppUrl(env.msalRedirectUriWeb) ||
    resolveAppBaseUrl();
  if (!base) return `https://cred.nbpdev.com.br${path}`;
  return `${String(base).replace(/\/$/, "")}${path}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTimeBr(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
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

function htmlToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function mimeFromName(filename, fallback = "application/octet-stream") {
  const ext = path.extname(String(filename || "")).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return map[ext] || fallback;
}

function readCoverDataUri(coverFilename) {
  if (!coverFilename) return null;
  const filePath = path.join(COVER_DIR, path.basename(coverFilename));
  if (!fs.existsSync(filePath)) return null;
  const mime = mimeFromName(coverFilename, "image/jpeg");
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function applyCoverToHtml(html, dataUri) {
  const body = String(html || "");
  if (!dataUri) return body;
  if (body.includes("cid:event-cover")) {
    return body.replace(/cid:event-cover/g, dataUri);
  }
  if (body.includes(dataUri) || /data-ea-cover/.test(body)) return body;
  return `<p><img src="${dataUri}" alt="" data-ea-cover="1" style="max-width:560px;width:100%;border-radius:12px;margin:0 0 16px;" /></p>${body}`;
}

function buildDefaultInviteSubject(item) {
  return `Indicação de colaboradores — ${item.name}`;
}

function buildDefaultInviteHtml(item, { coverDataUri } = {}) {
  const name = escapeHtml(item.name);
  const deadline = formatDateTimeBr(item.inscription_end);
  const link = buildItemUrl(item.id_event_accreditation) || "";
  const dataUri = coverDataUri || readCoverDataUri(item.cover);
  const cover = dataUri
    ? `<p><img src="${dataUri}" alt="" data-ea-cover="1" style="max-width:560px;width:100%;border-radius:12px;margin:0 0 16px;" /></p>`
    : item.cover
      ? `<p><img src="cid:event-cover" alt="" data-ea-cover="1" style="max-width:560px;width:100%;border-radius:12px;margin:0 0 16px;" /></p>`
      : "";
  return [
    cover,
    `<h2>Credenciamento de evento</h2>`,
    `<p>A empresa foi convidada a indicar colaboradores para <strong>${name}</strong> (${kindLabel(item.event_kind)}).</p>`,
    `<p>Prazo de inscrição: <strong>${escapeHtml(deadline)}</strong>.</p>`,
    link
      ? `<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#1d54e6;color:#fff;text-decoration:none;border-radius:8px;">Abrir credenciamento</a></p>`
      : "",
  ].join("");
}

function buildInviteAttachments(item, files = []) {
  const attachments = [];
  if (item.cover) {
    const filePath = path.join(COVER_DIR, path.basename(item.cover));
    if (fs.existsSync(filePath)) {
      attachments.push({
        filename: path.basename(item.cover),
        content: fs.readFileSync(filePath),
        contentType: mimeFromName(item.cover, "image/jpeg"),
        cid: "event-cover",
      });
    }
  }
  for (const file of files) {
    const stored = path.basename(file.filename || "");
    if (!stored) continue;
    const filePath = path.join(INVITE_FILE_DIR, stored);
    if (!fs.existsSync(filePath)) continue;
    attachments.push({
      filename: file.original_name || stored,
      content: fs.readFileSync(filePath),
      contentType: file.mime || mimeFromName(file.original_name || stored),
    });
  }
  return attachments;
}

async function sendCompanyEmails({
  idCompany,
  subject,
  html,
  text,
  usuarioId = null,
  requestId = null,
  context = {},
  attachments,
}) {
  const recipients = await resolveCompanyEmails(idCompany);
  if (!recipients.length) {
    logger.warn(
      { id_company: idCompany, ...context },
      "Sem e-mail de empresa para notificação de credenciamento",
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
        attachments,
      });
      sent += 1;
    } catch (err) {
      logger.warn(
        { err, to, id_company: idCompany, ...context },
        "Falha ao enviar e-mail de credenciamento",
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
        logger.warn({ err }, "Erro em notificação de credenciamento de eventos");
      });
  });
}

function kindLabel(kind) {
  return kind === "JOGO" ? "Jogo" : "Showday";
}

function notifyCompaniesInvited({
  item,
  companyIds,
  usuarioId = null,
  requestId = null,
}) {
  schedule(async () => {
    const org = env.organizationName || "Credenciamento";
    const link = buildItemUrl(item.id_event_accreditation) || "";
    const name = escapeHtml(item.name);
    const deadline = formatDateTimeBr(item.inscription_end);
    const subject = `Indicação de colaboradores — ${item.name}`;
    const text = [
      `Olá,`,
      "",
      `A empresa foi convidada a indicar colaboradores para "${item.name}" (${kindLabel(item.event_kind)}) no sistema ${org}.`,
      `Prazo de inscrição: ${deadline}.`,
      link ? `Acesse: ${link}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const html = [
      `<h2>Credenciamento de evento</h2>`,
      `<p>A empresa foi convidada a indicar colaboradores para <strong>${name}</strong> (${kindLabel(item.event_kind)}).</p>`,
      `<p>Prazo de inscrição: <strong>${escapeHtml(deadline)}</strong>.</p>`,
      link
        ? `<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#1d54e6;color:#fff;text-decoration:none;border-radius:8px;">Abrir credenciamento</a></p>`
        : "",
    ].join("");

    for (const idCompany of companyIds) {
      await sendCompanyEmails({
        idCompany,
        subject,
        html,
        text,
        usuarioId,
        requestId,
        context: { id_event_accreditation: item.id_event_accreditation },
      });
    }
  });
}

async function sendInviteToCompanies({
  item,
  companyIds,
  subject,
  html,
  files = [],
  usuarioId = null,
  requestId = null,
  context = {},
}) {
  const coverDataUri = readCoverDataUri(item.cover);
  const resolvedHtml = applyCoverToHtml(
    html || buildDefaultInviteHtml(item, { coverDataUri }),
    coverDataUri,
  );
  const resolvedSubject = subject || buildDefaultInviteSubject(item);
  const attachments = buildInviteAttachments(item, files);
  const text = htmlToText(resolvedHtml);
  const results = [];
  for (const idCompany of companyIds) {
    const sent = await sendCompanyEmails({
      idCompany,
      subject: resolvedSubject,
      html: resolvedHtml,
      text,
      usuarioId,
      requestId,
      attachments,
      context: { id_event_accreditation: item.id_event_accreditation, ...context },
    });
    results.push({ id_company: idCompany, ...sent });
  }
  return results;
}

async function sendCompaniesReminder({
  item,
  companyIds,
  usuarioId = null,
  requestId = null,
  subject,
  html,
  files = [],
}) {
  return sendInviteToCompanies({
    item,
    companyIds,
    subject: subject || `Lembrete: ${buildDefaultInviteSubject(item)}`,
    html: html || buildDefaultInviteHtml(item),
    files,
    usuarioId,
    requestId,
    context: { reminder: true },
  });
}

async function listInternalNotifyRecipients() {
  const [settingsRows] = await db.execute(
    `SELECT ea_internal_notify_all FROM system_settings ORDER BY id ASC LIMIT 1`,
  );
  const notifyAll = !!Number(settingsRows[0]?.ea_internal_notify_all);
  if (notifyAll) {
    const [rows] = await db.execute(
      `SELECT u.id, u.email, u.nome_completo
         FROM usuarios u
         LEFT JOIN perfis p ON p.id = u.id_perfil
        WHERE u.ativo = 1
          AND u.is_ad_user = 1
          AND u.id_company IS NULL
          AND (p.requires_company IS NULL OR p.requires_company = 0)
          AND ${SQL_HAS_DEPARTMENT.replace(/departamento/g, "u.departamento")}
          AND u.email IS NOT NULL AND TRIM(u.email) <> ''
        ORDER BY u.nome_completo ASC`,
    );
    return rows;
  }
  const [rows] = await db.execute(
    `SELECT u.id, u.email, u.nome_completo
       FROM event_accreditation_internal_notify_user n
       INNER JOIN usuarios u ON u.id = n.id_usuario
       LEFT JOIN perfis p ON p.id = u.id_perfil
      WHERE u.ativo = 1
        AND u.is_ad_user = 1
        AND u.id_company IS NULL
        AND (p.requires_company IS NULL OR p.requires_company = 0)
        AND u.email IS NOT NULL AND TRIM(u.email) <> ''
      ORDER BY u.nome_completo ASC`,
  );
  return rows;
}

function notifyInternalUsersInvited({ item, usuarioId = null, requestId = null }) {
  schedule(async () => {
    const recipients = await listInternalNotifyRecipients();
    if (!recipients.length) {
      logger.info(
        { id_event_accreditation: item.id_event_accreditation },
        "Notificação interna de credenciamento sem destinatários (geral desligada ou whitelist vazia)",
      );
      return;
    }
    const org = env.organizationName || "Credenciamento";
    const link = buildItemUrl(item.id_event_accreditation) || "";
    const name = escapeHtml(item.name);
    const deadline = formatDateTimeBr(item.inscription_end);
    const subject = `Credenciamento interno — ${item.name}`;
    const text = [
      `Olá,`,
      "",
      `Você pode se inscrever no credenciamento interno "${item.name}" (${kindLabel(item.event_kind)}) no sistema ${org}.`,
      `Prazo de inscrição: ${deadline}.`,
      link ? `Acesse: ${link}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const html = [
      `<h2>Credenciamento interno</h2>`,
      `<p>Você pode se inscrever no credenciamento interno de <strong>${name}</strong> (${kindLabel(item.event_kind)}).</p>`,
      `<p>Prazo de inscrição: <strong>${escapeHtml(deadline)}</strong>.</p>`,
      link
        ? `<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#1d54e6;color:#fff;text-decoration:none;border-radius:8px;">Abrir credenciamento</a></p>`
        : "",
    ].join("");

    const teamsPath = `/credenciamento-eventos/${item.id_event_accreditation}`;
    const teamsMensagem = `Você pode se inscrever no credenciamento interno de ${item.name} (${kindLabel(item.event_kind)}). Prazo: ${deadline}.`;
    const teamsCard = buildInfoCard({
      titulo: subject,
      mensagem: teamsMensagem,
      tipoLabel: kindLabel(item.event_kind),
      finalidade: item.name,
      periodo: deadline,
      setorNome: item.setor_nome || null,
      detailUrl: buildTeamsItemUrl(item.id_event_accreditation),
    });

    for (const user of recipients) {
      try {
        await smtpService.sendMail({
          to: user.email,
          subject,
          html,
          text,
          usuarioId,
          requestId,
        });
      } catch (err) {
        logger.warn(
          { err, to: user.email, id_event_accreditation: item.id_event_accreditation },
          "Falha ao enviar e-mail de credenciamento interno",
        );
      }
      if (user.email) {
        try {
          const result = await teamsService.notifyUser(user.email, teamsMensagem, {
            path: teamsPath,
            adaptiveCard: teamsCard,
            activityMessage: subject,
          });
          if (!result?.ok) {
            logger.warn(
              { to: user.email, message: result?.message, id_event_accreditation: item.id_event_accreditation },
              "Teams não entregou convite interno de credenciamento",
            );
          }
        } catch (err) {
          logger.warn(
            { err, to: user.email, id_event_accreditation: item.id_event_accreditation },
            "Falha ao notificar credenciamento interno via Teams",
          );
        }
      }
    }

    await alertsService.createAlertsForUsers(
      recipients.map((u) => u.id),
      {
        tipo: "event_accreditation_internal",
        titulo: `Credenciamento interno — ${item.name}`,
        mensagem: `Você pode se inscrever até ${deadline}.`,
        link: link ? `/admin/credenciamento-eventos/${item.id_event_accreditation}` : null,
        tipoReferencia: "event_accreditation",
        idReferencia: item.id_event_accreditation,
      },
    );
  });
}

module.exports = {
  notifyCompaniesInvited,
  sendCompaniesReminder,
  sendInviteToCompanies,
  notifyInternalUsersInvited,
  listInternalNotifyRecipients,
  buildItemUrl,
  resolveCompanyEmails,
  buildDefaultInviteSubject,
  buildDefaultInviteHtml,
  applyCoverToHtml,
  readCoverDataUri,
  COVER_DIR,
  INVITE_FILE_DIR,
};
