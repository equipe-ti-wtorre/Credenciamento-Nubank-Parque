const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../../config/db");
const env = require("../../config/env");
const AppError = require("../../utils/AppError");
const smtpService = require("../smtp/smtp.service");
const emailTemplatesService = require("../email-templates/email-templates.service");
const { escapeHtml } = require("../email-templates/email-template.renderer");
const {
  FOOTER_EMAIL,
  emphasis,
  buildLinkNote,
  buildBrandedEmail,
} = require("../email-templates/email-template.layout");
const { createTokenPair } = require("./token.service");
const { assertUserCanAccess } = require("../../utils/userDepartment");
const { logger } = require("../../config/logger");

const RESET_TTL_HOURS = 2;
const GENERIC_MESSAGE =
  "Se este e-mail for de uma conta de empresa, enviamos um link para redefinir a senha.";

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function resolveAppBaseUrl() {
  if (env.appPublicUrl) return String(env.appPublicUrl).replace(/\/$/, "");
  if (env.corsOrigins?.[0]) return String(env.corsOrigins[0]).replace(/\/$/, "");
  return "";
}

function buildResetUrl(rawToken) {
  const base = resolveAppBaseUrl();
  if (!base) {
    throw new AppError("URL pública do aplicativo não configurada (APP_PUBLIC_URL).", 500);
  }
  return `${base}/login?reset=${encodeURIComponent(rawToken)}`;
}

function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

async function findEligibleUser(email) {
  const [rows] = await db.execute(
    `SELECT u.*, c.company_name, c.fancy_name
       FROM usuarios u
       LEFT JOIN company c ON c.id_company = u.id_company
      WHERE LOWER(u.email) = LOWER(?)
        AND u.ativo = 1
        AND u.is_ad_user = 0
        AND u.id_company IS NOT NULL
        AND u.senha_hash IS NOT NULL
      LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

async function invalidateActiveTokens(userId, conn = db) {
  await conn.execute(
    `UPDATE password_reset_tokens
        SET used_at = NOW()
      WHERE id_usuario = ? AND used_at IS NULL`,
    [userId],
  );
}

async function sendResetEmail({ to, nome, companyName, rawToken, usuarioId, requestId }) {
  const resetUrl = buildResetUrl(rawToken);
  const org = env.organizationName || "Credenciamento";
  const vars = {
    nome: nome || "",
    organization_name: org,
    company_name: companyName || org,
    reset_url: resetUrl,
    reset_ttl_hours: String(RESET_TTL_HOURS),
  };

  const rendered = await emailTemplatesService.renderActive("password_reset", vars);
  const subject = rendered?.subject || `Redefinir senha — ${org}`;
  const text =
    rendered?.text ||
    [
      `Olá${nome ? ` ${nome}` : ""},`,
      "",
      "Recebemos um pedido para redefinir a senha da sua conta de empresa.",
      "",
      `Acesse o link abaixo para criar uma nova senha (válido por ${RESET_TTL_HOURS} horas):`,
      resetUrl,
      "",
      "Se você não pediu esta alteração, ignore esta mensagem. Sua senha atual continua valendo.",
    ].join("\n");
  const safeNome = escapeHtml(nome || "");
  const safeUrl = escapeHtml(resetUrl);
  const html =
    rendered?.html ||
    buildBrandedEmail({
      preheader: `Link para redefinir a senha da sua conta de empresa. Válido por ${RESET_TTL_HOURS} horas.`,
      title: "Redefinir senha",
      kicker: "Acesso de empresas",
      paragraphs: [
        `Olá${safeNome ? ` ${emphasis(safeNome)}` : ""},`,
        "Recebemos um pedido para redefinir a senha da sua conta de empresa no Credenciamento.",
      ],
      cta: { href: safeUrl, label: "Redefinir senha" },
      noteHtml: buildLinkNote({
        validFor: `${RESET_TTL_HOURS} horas`,
        url: safeUrl,
      }),
      footerDisclaimer: FOOTER_EMAIL,
    });

  try {
    await smtpService.sendMail({
      to,
      subject,
      text,
      html,
      usuarioId,
      requestId,
    });
  } catch (err) {
    logger.error({ err }, "Falha ao enviar e-mail de recuperação de senha");
    throw new AppError(
      "Não foi possível enviar o e-mail de recuperação. Tente novamente em alguns minutos.",
      503,
    );
  }
}

/**
 * Sempre devolve a mesma mensagem. Só envia e-mail para conta de empresa ativa com senha local.
 */
async function requestReset(email, req) {
  const normalized = String(email || "").trim();
  const user = await findEligibleUser(normalized);
  if (!user) return { message: GENERIC_MESSAGE };

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000);
  const companyName = user.company_name || user.fancy_name || "";

  await invalidateActiveTokens(user.id);
  await db.execute(
    `INSERT INTO password_reset_tokens (id_usuario, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [user.id, tokenHash, expiresAt],
  );

  await sendResetEmail({
    to: user.email,
    nome: user.nome_completo,
    companyName,
    rawToken,
    usuarioId: user.id,
    requestId: req?.id || req?.requestId,
  });

  return { message: GENERIC_MESSAGE };
}

async function findValidResetByToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const [rows] = await db.execute(
    `SELECT t.*, u.email, u.nome_completo, u.ativo AS user_ativo, u.is_ad_user, u.id_company, u.senha_hash
       FROM password_reset_tokens t
       INNER JOIN usuarios u ON u.id = t.id_usuario
      WHERE t.token_hash = ?
      LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row || row.is_ad_user === 1 || row.id_company == null || !row.senha_hash) {
    throw new AppError("Link inválido ou expirado.", 404);
  }
  if (row.used_at) throw new AppError("Este link já foi utilizado.", 410);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new AppError("Este link expirou. Solicite uma nova recuperação de senha.", 410);
  }
  if (!row.user_ativo) throw new AppError("Link inválido ou expirado.", 404);
  return row;
}

async function getResetInfo(rawToken) {
  const row = await findValidResetByToken(rawToken);
  return {
    email_masked: maskEmail(row.email),
    expires_at: row.expires_at,
  };
}

async function completeReset(rawToken, password, req) {
  const row = await findValidResetByToken(rawToken);
  const senhaHash = await bcrypt.hash(String(password), 10);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`UPDATE usuarios SET senha_hash = ? WHERE id = ?`, [
      senhaHash,
      row.id_usuario,
    ]);
    await conn.execute(
      `UPDATE password_reset_tokens
          SET used_at = NOW()
        WHERE id_usuario = ? AND used_at IS NULL`,
      [row.id_usuario],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const [users] = await db.execute("SELECT * FROM usuarios WHERE id = ? LIMIT 1", [
    row.id_usuario,
  ]);
  const user = users[0];
  if (!user || !user.ativo) {
    throw new AppError("Não foi possível redefinir a senha.", 500);
  }
  assertUserCanAccess(user);

  const authService = require("./auth.service");
  const tokens = await createTokenPair(user, req);
  return await authService.buildAuthResponse(tokens, user);
}

module.exports = {
  RESET_TTL_HOURS,
  GENERIC_MESSAGE,
  requestReset,
  getResetInfo,
  completeReset,
};
