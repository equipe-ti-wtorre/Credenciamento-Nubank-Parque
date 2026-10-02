/** Shell visual dos e-mails (Nubank Parque), baseado no convite de acesso. */

const FONT_DISPLAY = "'Sora','Segoe UI',Helvetica,Arial,sans-serif";
const FONT_BODY = "'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif";

const FOOTER_EMAIL =
  "Este é um e-mail automático do sistema de Credenciamento. Por favor, não responda.<br>Se você não esperava este e-mail, ignore esta mensagem.";

const FOOTER_INVITE =
  "Este é um e-mail automático do sistema de Credenciamento. Por favor, não responda.<br>Se você não esperava este convite, ignore esta mensagem.";

const PREHEADER_PAD = "\u034f\u200c&nbsp;".repeat(8);

function emphasis(html) {
  return `<strong style="color: #420465;">${html}</strong>`;
}

function buildLinkNote({ validFor, url }) {
  const ttl = validFor
    ? `<p class="font-body" style="margin: 0 0 8px 0; font-family: ${FONT_BODY}; font-size: 14px; font-weight: bold; color: #420465; line-height: 1.5;">&#9201; Link válido por ${validFor}.</p>`
    : "";
  return [
    ttl,
    `<p class="font-body" style="margin: 0 0 6px 0; font-family: ${FONT_BODY}; font-size: 13px; color: #5B4A78; line-height: 1.6;">Se o botão não funcionar, copie e cole o endereço abaixo no seu navegador:</p>`,
    `<p style="margin: 0; word-break: break-all;"><a style="font-family: 'Courier New',monospace; font-size: 12px; color: #8D0DE3; text-decoration: underline; line-height: 1.6;" href="${url}">${url}</a></p>`,
  ].join("");
}

function buildDetailNote(items) {
  return items
    .map((item, index) => {
      const margin = index === items.length - 1 ? "0" : "0 0 12px 0";
      return `<p class="font-body" style="margin: ${margin}; font-family: ${FONT_BODY}; font-size: 14px; color: #2A2340; line-height: 1.5;"><span style="display: block; font-size: 11px; font-weight: bold; letter-spacing: 0.6px; text-transform: uppercase; color: #A98FD6;">${item.label}</span>${item.value}</p>`;
    })
    .join("");
}

function renderParagraphs(paragraphs) {
  return paragraphs
    .map((paragraph, index) => {
      const html = typeof paragraph === "string" ? paragraph : paragraph.html;
      const paddingBottom =
        typeof paragraph === "string"
          ? index === paragraphs.length - 1
            ? "28px"
            : "16px"
          : paragraph.paddingBottom || "16px";
      return `<tr><td class="font-body" style="font-family: ${FONT_BODY}; font-size: 16px; color: #2A2340; line-height: 1.6; padding-bottom: ${paddingBottom};">${html}</td></tr>`;
    })
    .join("");
}

function renderCta(cta) {
  if (!cta || !cta.href || !cta.label) return "";
  return `<tr><td class="btn-td px" style="padding: 0 40px 32px 40px;" align="left"><table class="btn" role="presentation" border="0" cellspacing="0" cellpadding="0"><tbody><tr><td style="border-radius: 999px;" align="center" bgcolor="#8D0DE3"><a class="font-body" style="display: inline-block; font-family: ${FONT_BODY}; font-size: 16px; font-weight: bold; color: #FFFFFF; text-decoration: none; background-color: #8D0DE3; border-radius: 999px; padding: 16px 40px; line-height: 20px;" href="${cta.href}" target="_blank" rel="noopener">${cta.label}</a></td></tr></tbody></table></td></tr>`;
}

function renderNote(noteHtml, hasCta) {
  if (!noteHtml) return "";
  const padding = hasCta ? "0 40px 40px 40px" : "8px 40px 40px 40px";
  return `<tr><td class="px" style="padding: ${padding};"><table style="background-color: #E9DEF7; border-radius: 12px;" role="presentation" border="0" width="100%" cellspacing="0" cellpadding="0"><tbody><tr><td style="padding: 20px 24px;">${noteHtml}</td></tr></tbody></table></td></tr>`;
}

/**
 * @param {object} options
 * @param {string} options.preheader
 * @param {string} options.title
 * @param {string} options.kicker
 * @param {Array<string|{html: string, paddingBottom?: string}>} options.paragraphs
 * @param {{href: string, label: string}|null} [options.cta]
 * @param {string|null} [options.noteHtml]
 * @param {string} [options.footerDisclaimer]
 */
function buildBrandedEmail({
  preheader,
  title,
  kicker,
  paragraphs,
  cta = null,
  noteHtml = null,
  footerDisclaimer = FOOTER_EMAIL,
}) {
  const hasCta = Boolean(cta && cta.href && cta.label);
  const bodyPadding = hasCta || noteHtml ? "40px 40px 8px 40px" : "40px";

  return [
    `<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #F4EEFB; opacity: 0;">${preheader} ${PREHEADER_PAD}</div>`,
    `<table style="background-color: #F4EEFB;" role="presentation" border="0" width="100%" cellspacing="0" cellpadding="0"><tbody><tr><td style="padding: 32px 12px;" align="center">`,
    `<table class="container" style="width: 600px; max-width: 600px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(66,4,101,0.12);" role="presentation" border="0" width="600" cellspacing="0" cellpadding="0"><tbody>`,
    `<tr><td style="background-color: #420465; background-image: linear-gradient(180deg,#2E0348 0%,#420465 100%); padding: 36px 40px;" align="left"><table role="presentation" border="0" width="100%" cellspacing="0" cellpadding="0"><tbody><tr><td align="left"><span class="font-display" style="font-family: ${FONT_DISPLAY}; font-size: 22px; font-weight: bold; color: #FFFFFF; letter-spacing: -0.3px;">Nubank&nbsp;Parque</span></td></tr></tbody></table></td></tr>`,
    `<tr><td style="height: 4px; background-color: #8D0DE3; line-height: 4px; font-size: 4px;">&nbsp;</td></tr>`,
    `<tr><td class="px" style="padding: ${bodyPadding};"><table role="presentation" border="0" width="100%" cellspacing="0" cellpadding="0"><tbody>`,
    `<tr><td class="font-display" style="font-family: ${FONT_DISPLAY}; font-size: 26px; font-weight: bold; color: #420465; line-height: 1.25; padding-bottom: 8px;">${title}</td></tr>`,
    `<tr><td class="font-body" style="font-family: ${FONT_BODY}; font-size: 12px; font-weight: bold; color: #A98FD6; letter-spacing: 1px; text-transform: uppercase; padding-bottom: 20px;">${kicker}</td></tr>`,
    renderParagraphs(paragraphs),
    `</tbody></table></td></tr>`,
    renderCta(cta),
    renderNote(noteHtml, hasCta),
    `<tr><td style="background-color: #420465; padding: 28px 40px;" align="center"><table role="presentation" border="0" width="100%" cellspacing="0" cellpadding="0"><tbody>`,
    `<tr><td class="font-body" style="font-family: ${FONT_BODY}; font-size: 13px; font-weight: 600; color: #E9DEF7; padding-bottom: 6px;" align="center">Nubank Parque</td></tr>`,
    `<tr><td class="font-body" style="font-family: ${FONT_BODY}; font-size: 11px; color: #B9A3E4; line-height: 1.6;" align="center">${footerDisclaimer}</td></tr>`,
    `</tbody></table></td></tr>`,
    `</tbody></table></td></tr></tbody></table>`,
  ].join("");
}

module.exports = {
  FONT_BODY,
  FONT_DISPLAY,
  FOOTER_EMAIL,
  FOOTER_INVITE,
  emphasis,
  buildLinkNote,
  buildDetailNote,
  buildBrandedEmail,
};
