const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../../config/db");
const env = require("../../config/env");
const AppError = require("../../utils/AppError");
const smtpService = require("../smtp/smtp.service");
const emailTemplatesService = require("../email-templates/email-templates.service");
const { escapeHtml } = require("../email-templates/email-template.renderer");
const {
  FOOTER_INVITE,
  emphasis,
  buildLinkNote,
  buildBrandedEmail,
} = require("../email-templates/email-template.layout");
const profilesService = require("../profiles/profiles.service");
const { createTokenPair } = require("./token.service");

const INVITE_TTL_HOURS = 72;
const EMPRESA_PROFILE_CODES = ["EMPRESA_GESTOR", "EMPRESA_SOLICITANTE"];

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function resolveAppBaseUrl() {
  if (env.appPublicUrl) return env.appPublicUrl;
  if (env.corsOrigins?.[0]) return String(env.corsOrigins[0]).replace(/\/$/, "");
  return "";
}

function buildInviteUrl(rawToken) {
  const base = resolveAppBaseUrl();
  if (!base) {
    throw new AppError(
      "URL pública do aplicativo não configurada (APP_PUBLIC_URL).",
      500,
    );
  }
  return `${base}/cadastro-acesso?token=${encodeURIComponent(rawToken)}`;
}

async function getEmpresaProfileId(codigo) {
  const profile = await profilesService.getProfileByCodigo(codigo);
  if (!profile || !profile.ativo) {
    throw new AppError(`Perfil ${codigo} não encontrado.`, 500);
  }
  return profile.id;
}

function buildUsernameFromEmail(email) {
  const local = String(email)
    .split("@")[0]
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 40);
  return local || `empresa_${Date.now().toString(36)}`;
}

async function findUserByEmail(email) {
  const [rows] = await db.execute(
    "SELECT * FROM usuarios WHERE LOWER(email) = LOWER(?) LIMIT 1",
    [email],
  );
  return rows[0] || null;
}

async function ensureUniqueUsername(base) {
  let username = base;
  let attempt = 0;
  while (attempt < 20) {
    const [rows] = await db.execute(
      "SELECT id FROM usuarios WHERE username = ? LIMIT 1",
      [username],
    );
    if (rows.length === 0) return username;
    attempt += 1;
    username = `${base}${attempt}`.slice(0, 50);
  }
  return `${base}_${Date.now().toString(36)}`.slice(0, 50);
}

async function invalidateActiveTokens(userId, conn = db) {
  await conn.execute(
    "UPDATE user_invite_tokens SET used_at = NOW() WHERE id_usuario = ? AND used_at IS NULL",
    [userId],
  );
}

async function createInviteToken(userId, conn = db) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  await invalidateActiveTokens(userId, conn);
  await conn.execute(
    `INSERT INTO user_invite_tokens (id_usuario, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [userId, tokenHash, expiresAt],
  );

  return { rawToken, expiresAt };
}

async function sendInviteEmail({
  to,
  nome,
  companyName,
  rawToken,
  perfilLabel,
  usuarioId,
  requestId,
}) {
  const inviteUrl = buildInviteUrl(rawToken);
  const org = env.organizationName || "Credenciamento";
  const companySuffix = companyName ? ` da empresa ${companyName}` : "";
  const vars = {
    nome: nome || "",
    organization_name: org,
    company_name: companyName || org,
    company_suffix: companySuffix,
    perfil_label: perfilLabel || "usuário da empresa",
    invite_url: inviteUrl,
    invite_ttl_hours: String(INVITE_TTL_HOURS),
  };

  const rendered = await emailTemplatesService.renderActive("invite_access", vars);
  const subject =
    rendered?.subject || `Cadastro de acesso — ${companyName || org}`;
  const text =
    rendered?.text ||
    [
      `Olá${nome ? ` ${nome}` : ""},`,
      "",
      `Você foi convidado(a) para acessar o sistema ${org} como ${perfilLabel || "usuário da empresa"}${companySuffix}.`,
      "",
      `Acesse o link abaixo para definir sua senha (válido por ${INVITE_TTL_HOURS} horas):`,
      inviteUrl,
      "",
      "Se você não esperava este e-mail, ignore esta mensagem.",
    ].join("\n");
  const safeNome = escapeHtml(nome || "");
  const safeCompany = escapeHtml(companyName || org);
  const safeUrl = escapeHtml(inviteUrl);
  const html =
    rendered?.html ||
    buildBrandedEmail({
      preheader: `Você foi convidado(a) para acessar o sistema Credenciamento do Nubank Parque. Link válido por ${INVITE_TTL_HOURS} horas.`,
      title: "Cadastro de acesso",
      kicker: "Convite ao sistema Credenciamento",
      paragraphs: [
        `Olá${safeNome ? ` ${emphasis(safeNome)}` : ""},`,
        `Você foi convidado(a) para acessar o sistema ${emphasis("Credenciamento")} da empresa ${emphasis(safeCompany)}.`,
      ],
      cta: { href: safeUrl, label: "Definir senha e acessar" },
      noteHtml: buildLinkNote({
        validFor: `${INVITE_TTL_HOURS} horas`,
        url: safeUrl,
      }),
      footerDisclaimer: FOOTER_INVITE,
    });

  await smtpService.sendMail({
    to,
    subject,
    text,
    html,
    usuarioId,
    requestId,
  });

  return inviteUrl;
}

/**
 * Cria ou reutiliza usuário de empresa e envia convite por e-mail.
 */
async function inviteCompanyUser({
  idCompany,
  companyName,
  email,
  nome,
  profileCodigo,
  usuarioId,
  requestId,
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new AppError("E-mail é obrigatório para enviar o acesso.", 400);
  }
  if (!EMPRESA_PROFILE_CODES.includes(profileCodigo)) {
    throw new AppError("Perfil de convite inválido.", 400);
  }

  const idPerfil = await getEmpresaProfileId(profileCodigo);
  const perfilLabel =
    profileCodigo === "EMPRESA_GESTOR"
      ? "gestor da empresa"
      : "solicitante da empresa";

  let user = await findUserByEmail(normalizedEmail);

  if (user) {
    if (user.is_ad_user) {
      throw new AppError(
        "Este e-mail pertence a um usuário interno (Azure AD) e não pode receber acesso de empresa.",
        409,
      );
    }
    if (user.id_company != null && Number(user.id_company) !== Number(idCompany)) {
      throw new AppError("Este e-mail já está vinculado a outra empresa.", 409);
    }

    const ctx = await profilesService.loadUserProfileContext(user.id);
    const currentCodigo = ctx?.codigo || null;
    if (
      currentCodigo &&
      !EMPRESA_PROFILE_CODES.includes(currentCodigo) &&
      currentCodigo !== "PRODUTORA" &&
      currentCodigo !== "PADRAO"
    ) {
      throw new AppError("Este e-mail já pertence a um usuário do sistema.", 409);
    }

    await db.execute(
      `UPDATE usuarios
       SET id_company = ?, id_perfil = ?, nome_completo = COALESCE(NULLIF(?, ''), nome_completo),
           email = ?, ativo = 0, senha_hash = NULL, is_ad_user = 0
       WHERE id = ?`,
      [idCompany, idPerfil, nome || null, normalizedEmail, user.id],
    );
  } else {
    const username = await ensureUniqueUsername(buildUsernameFromEmail(normalizedEmail));
    const [result] = await db.execute(
      `INSERT INTO usuarios
         (username, nome_completo, email, departamento, senha_hash, id_perfil, id_company, ativo, is_ad_user)
       VALUES (?, ?, ?, NULL, NULL, ?, ?, 0, 0)`,
      [username, nome || normalizedEmail, normalizedEmail, idPerfil, idCompany],
    );
    user = {
      id: result.insertId,
      email: normalizedEmail,
      nome_completo: nome || normalizedEmail,
    };
  }

  const { rawToken } = await createInviteToken(user.id);
  await sendInviteEmail({
    to: normalizedEmail,
    nome: nome || user.nome_completo,
    companyName,
    rawToken,
    perfilLabel,
    usuarioId,
    requestId,
  });

  return {
    id_usuario: user.id,
    email: normalizedEmail,
    profile_codigo: profileCodigo,
    expires_in_hours: INVITE_TTL_HOURS,
  };
}

async function findValidInviteByToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const [rows] = await db.execute(
    `SELECT t.*, u.email, u.nome_completo, u.username, u.id_company, u.ativo AS user_ativo,
            c.company_name, c.fancy_name, p.codigo AS perfil_codigo, p.nome AS perfil_nome
     FROM user_invite_tokens t
     INNER JOIN usuarios u ON u.id = t.id_usuario
     LEFT JOIN company c ON c.id_company = u.id_company
     LEFT JOIN perfis p ON p.id = u.id_perfil
     WHERE t.token_hash = ? LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) throw new AppError("Convite inválido ou expirado.", 404);
  if (row.used_at) throw new AppError("Este convite já foi utilizado.", 410);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new AppError("Este convite expirou. Solicite um novo envio de acesso.", 410);
  }
  return row;
}

async function getInviteInfo(rawToken) {
  const row = await findValidInviteByToken(rawToken);
  return {
    email: row.email,
    nome_completo: row.nome_completo,
    company_name: row.company_name || row.fancy_name || null,
    perfil: row.perfil_nome || row.perfil_codigo || null,
    expires_at: row.expires_at,
  };
}

async function completeInvite(rawToken, password, req) {
  if (!password || String(password).length < 8) {
    throw new AppError("A senha deve ter no mínimo 8 caracteres.", 400);
  }

  const row = await findValidInviteByToken(rawToken);
  const senhaHash = await bcrypt.hash(String(password), 10);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(`UPDATE usuarios SET senha_hash = ?, ativo = 1 WHERE id = ?`, [
      senhaHash,
      row.id_usuario,
    ]);
    await conn.execute(`UPDATE user_invite_tokens SET used_at = NOW() WHERE id = ?`, [
      row.id,
    ]);
    await invalidateActiveTokens(row.id_usuario, conn);

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
    throw new AppError("Não foi possível ativar o usuário.", 500);
  }

  const authService = require("./auth.service");
  const tokens = await createTokenPair(user, req);
  return await authService.buildAuthResponse(tokens, user);
}

module.exports = {
  INVITE_TTL_HOURS,
  EMPRESA_PROFILE_CODES,
  inviteCompanyUser,
  getInviteInfo,
  completeInvite,
  getEmpresaProfileId,
  findUserByEmail,
};
