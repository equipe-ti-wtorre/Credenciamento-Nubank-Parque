const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../../config/db");
const env = require("../../config/env");
const AppError = require("../../utils/AppError");
const { normalizeCnpj, isValidCnpj } = require("../../utils/cnpj");
const smtpService = require("../smtp/smtp.service");
const emailTemplatesService = require("../email-templates/email-templates.service");
const { escapeHtml } = require("../email-templates/email-template.renderer");
const {
  FOOTER_INVITE,
  emphasis,
  buildLinkNote,
  buildBrandedEmail,
} = require("../email-templates/email-template.layout");
const { createTokenPair } = require("../auth/token.service");
const {
  INVITE_TTL_HOURS,
  getEmpresaProfileId,
  findUserByEmail,
} = require("../auth/invite.service");

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function producerOriginId(userId, conn = db) {
  if (!userId) return null;
  const [rows] = await conn.execute(
    `SELECT u.id_company
     FROM usuarios u
     INNER JOIN company c ON c.id_company = u.id_company
     INNER JOIN company_type ct ON ct.id_company_type = c.id_company_type
     WHERE u.id = ? AND ct.description = 'Produtora'
     LIMIT 1`,
    [userId],
  );
  return rows[0]?.id_company ?? null;
}

function resolveAppBaseUrl() {
  if (env.appPublicUrl) return env.appPublicUrl;
  if (env.corsOrigins?.[0]) return String(env.corsOrigins[0]).replace(/\/$/, "");
  return "";
}

function buildRegisterUrl(rawToken) {
  const base = resolveAppBaseUrl();
  if (!base) {
    throw new AppError(
      "URL pública do aplicativo não configurada (APP_PUBLIC_URL).",
      500,
    );
  }
  return `${base}/cadastro-empresa?token=${encodeURIComponent(rawToken)}`;
}

function buildUsernameFromEmail(email) {
  const local = String(email)
    .split("@")[0]
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 40);
  return local || `empresa_${Date.now().toString(36)}`;
}

async function ensureUniqueUsername(base, conn = db) {
  let username = base;
  let attempt = 0;
  while (attempt < 20) {
    const [rows] = await conn.execute(
      "SELECT id FROM usuarios WHERE username = ? LIMIT 1",
      [username],
    );
    if (rows.length === 0) return username;
    attempt += 1;
    username = `${base}${attempt}`.slice(0, 50);
  }
  return `${base}_${Date.now().toString(36)}`.slice(0, 50);
}

async function findCompanyTypeById(id) {
  const [rows] = await db.execute(
    "SELECT id_company_type, description FROM company_type WHERE id_company_type = ? LIMIT 1",
    [id],
  );
  return rows[0] || null;
}

async function assertEmailAvailable(email) {
  const user = await findUserByEmail(email);
  if (!user) return;

  if (user.is_ad_user) {
    throw new AppError(
      "Este e-mail pertence a um usuário interno (Azure AD) e não pode receber acesso de empresa.",
      409,
    );
  }
  if (user.id_company != null) {
    throw new AppError("Este e-mail já está vinculado a outra empresa.", 409);
  }
  throw new AppError("Este e-mail já pertence a um usuário do sistema.", 409);
}

async function invalidateActiveTokensByEmail(email, conn = db) {
  await conn.execute(
    `UPDATE company_self_register_tokens
     SET used_at = NOW()
     WHERE LOWER(email) = LOWER(?) AND used_at IS NULL`,
    [email],
  );
}

async function createRegisterToken({ email, name, idCompanyType, usuarioId }, conn = db) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  await invalidateActiveTokensByEmail(email, conn);
  await conn.execute(
    `INSERT INTO company_self_register_tokens
       (token_hash, email, name, id_company_type, id_usuario_criador, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tokenHash, email, name, idCompanyType, usuarioId || null, expiresAt],
  );

  return { rawToken, expiresAt };
}

async function sendSelfRegisterEmail({
  to,
  nome,
  rawToken,
  companyTypeLabel,
  usuarioId,
  requestId,
}) {
  const inviteUrl = buildRegisterUrl(rawToken);
  const org = env.organizationName || "Credenciamento";
  const vars = {
    nome: nome || "",
    organization_name: org,
    invite_url: inviteUrl,
    invite_ttl_hours: String(INVITE_TTL_HOURS),
    company_type_label: companyTypeLabel || "",
  };

  const rendered = await emailTemplatesService.renderActive("company_self_register", vars);
  const typeSuffix = companyTypeLabel ? ` (${companyTypeLabel})` : "";
  const subject = rendered?.subject || `Cadastro da empresa — ${org}`;
  const text =
    rendered?.text ||
    [
      `Olá${nome ? ` ${nome}` : ""},`,
      "",
      `Você foi convidado(a) a cadastrar sua empresa no sistema ${org}${typeSuffix}.`,
      "",
      `Acesse o link abaixo para preencher os dados e definir sua senha (válido por ${INVITE_TTL_HOURS} horas):`,
      inviteUrl,
      "",
      "Se você não esperava este e-mail, ignore esta mensagem.",
    ].join("\n");
  const safeNome = escapeHtml(nome || "");
  const safeType = escapeHtml(companyTypeLabel || "");
  const safeUrl = escapeHtml(inviteUrl);
  const html =
    rendered?.html ||
    buildBrandedEmail({
      preheader: `Você foi convidado(a) a cadastrar sua empresa no sistema Credenciamento do Nubank Parque. Link válido por ${INVITE_TTL_HOURS} horas.`,
      title: "Cadastro da empresa",
      kicker: "Convite ao sistema Credenciamento",
      paragraphs: [
        `Olá${safeNome ? ` ${emphasis(safeNome)}` : ""},`,
        `Você foi convidado(a) a cadastrar sua empresa no sistema ${emphasis("Credenciamento")}${safeType ? ` como ${emphasis(safeType)}` : ""}.`,
      ],
      cta: { href: safeUrl, label: "Cadastrar empresa" },
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

async function inviteSelfRegister({ email, name, id_company_type, usuarioId, requestId }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedName = String(name || "").trim();
  if (!normalizedEmail) {
    throw new AppError("E-mail é obrigatório para enviar o link de cadastro.", 400);
  }
  if (!normalizedName) {
    throw new AppError("Nome do responsável é obrigatório.", 400);
  }

  const companyType = await findCompanyTypeById(id_company_type);
  if (!companyType) {
    throw new AppError("Tipo de empresa inválido.", 400);
  }

  await assertEmailAvailable(normalizedEmail);

  const { rawToken, expiresAt } = await createRegisterToken({
    email: normalizedEmail,
    name: normalizedName,
    idCompanyType: companyType.id_company_type,
    usuarioId,
  });

  await sendSelfRegisterEmail({
    to: normalizedEmail,
    nome: normalizedName,
    rawToken,
    companyTypeLabel: companyType.description,
    usuarioId,
    requestId,
  });

  return {
    email: normalizedEmail,
    name: normalizedName,
    id_company_type: companyType.id_company_type,
    company_type_label: companyType.description,
    expires_at: expiresAt,
    expires_in_hours: INVITE_TTL_HOURS,
  };
}

async function findValidRegisterByToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const [rows] = await db.execute(
    `SELECT t.*, ct.description AS company_type_label
     FROM company_self_register_tokens t
     INNER JOIN company_type ct ON ct.id_company_type = t.id_company_type
     WHERE t.token_hash = ? LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) throw new AppError("Link de cadastro inválido ou expirado.", 404);
  if (row.used_at) throw new AppError("Este link de cadastro já foi utilizado.", 410);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new AppError("Este link expirou. Solicite um novo envio.", 410);
  }
  return row;
}

async function getSelfRegisterInfo(rawToken) {
  const row = await findValidRegisterByToken(rawToken);
  return {
    email: row.email,
    name: row.name,
    id_company_type: row.id_company_type,
    company_type_label: row.company_type_label || null,
    expires_at: row.expires_at,
  };
}

async function findCompanyByCnpj(cnpj, conn = db) {
  const [rows] = await conn.execute(
    "SELECT id_company FROM company WHERE cnpj = ? LIMIT 1",
    [cnpj],
  );
  return rows[0] || null;
}

function saveCompanyLogoFile(file) {
  if (!file?.buffer) return null;
  const path = require("path");
  const fs = require("fs");
  const { v4: uuidv4 } = require("uuid");

  const storageDir = path.join(__dirname, "../../storage/company-logos");
  fs.mkdirSync(storageDir, { recursive: true });

  const ext = path.extname(file.originalname || ".jpg").toLowerCase() || ".jpg";
  const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
  const filename = `${uuidv4()}${safeExt}`;
  fs.writeFileSync(path.join(storageDir, filename), file.buffer);
  return filename;
}

async function completeSelfRegister(rawToken, data, req, logoFile = null) {
  const password = String(data.password || "");
  if (password.length < 8) {
    throw new AppError("A senha deve ter no mínimo 8 caracteres.", 400);
  }

  const cnpj = normalizeCnpj(data.cnpj);
  if (!isValidCnpj(cnpj)) {
    throw new AppError("CNPJ inválido.", 400);
  }

  const row = await findValidRegisterByToken(rawToken);
  await assertEmailAvailable(row.email);

  const existingCompany = await findCompanyByCnpj(cnpj);
  if (existingCompany) {
    throw new AppError("CNPJ já cadastrado.", 409);
  }

  const companyName = String(data.company_name || "").trim();
  if (!companyName) {
    throw new AppError("Razão social é obrigatória.", 400);
  }

  const responsibleName = String(data.name || row.name || "").trim() || row.name;
  const fancyName = String(data.fancy_name || "").trim();
  if (!fancyName) {
    throw new AppError("Nome fantasia é obrigatório.", 400);
  }
  const phone = String(data.phone || "").trim();
  if (phone.replace(/\D/g, "").length < 10) {
    throw new AppError("Informe um telefone válido.", 400);
  }
  const department = data.department ? String(data.department).trim() || null : null;
  const idPerfil = await getEmpresaProfileId("EMPRESA_GESTOR");
  const senhaHash = await bcrypt.hash(password, 10);

  const conn = await db.getConnection();
  let userId;
  let companyId;
  try {
    await conn.beginTransaction();

    const [locked] = await conn.execute(
      `SELECT id, used_at, expires_at, email, name, id_company_type, id_usuario_criador
       FROM company_self_register_tokens
       WHERE id = ? FOR UPDATE`,
      [row.id],
    );
    const tokenRow = locked[0];
    if (!tokenRow || tokenRow.used_at) {
      throw new AppError("Este link de cadastro já foi utilizado.", 410);
    }
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      throw new AppError("Este link expirou. Solicite um novo envio.", 410);
    }

    const duplicate = await findCompanyByCnpj(cnpj, conn);
    if (duplicate) {
      throw new AppError("CNPJ já cadastrado.", 409);
    }

    const logoFilename = saveCompanyLogoFile(logoFile);
    const idCompanyOrigem = await producerOriginId(tokenRow.id_usuario_criador, conn);

    const [companyResult] = await conn.execute(
      `INSERT INTO company (id_company_type, cnpj, company_name, fancy_name, status, logo, id_company_origem)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [tokenRow.id_company_type, cnpj, companyName, fancyName, logoFilename, idCompanyOrigem],
    );
    companyId = companyResult.insertId;

    await conn.execute(
      `INSERT INTO company_contact (id_company, name, department, phone, email)
       VALUES (?, ?, ?, ?, ?)`,
      [companyId, responsibleName, department, phone, tokenRow.email],
    );

    const username = await ensureUniqueUsername(
      buildUsernameFromEmail(tokenRow.email),
      conn,
    );
    const [userResult] = await conn.execute(
      `INSERT INTO usuarios
         (username, nome_completo, email, departamento, senha_hash, id_perfil, id_company, ativo, is_ad_user)
       VALUES (?, ?, ?, NULL, ?, ?, ?, 1, 0)`,
      [username, responsibleName, tokenRow.email, senhaHash, idPerfil, companyId],
    );
    userId = userResult.insertId;

    await conn.execute(
      `UPDATE company_self_register_tokens
       SET used_at = NOW(), id_company = ?
       WHERE id = ?`,
      [companyId, tokenRow.id],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      const msg = String(err.message || "");
      if (msg.includes("cnpj")) {
        throw new AppError("CNPJ já cadastrado.", 409);
      }
      throw new AppError("E-mail ou usuário já cadastrado.", 409);
    }
    throw err;
  } finally {
    conn.release();
  }

  const [users] = await db.execute("SELECT * FROM usuarios WHERE id = ? LIMIT 1", [userId]);
  const user = users[0];
  if (!user || !user.ativo) {
    throw new AppError("Não foi possível ativar o usuário.", 500);
  }

  const authService = require("../auth/auth.service");
  const tokens = await createTokenPair(user, req);
  return await authService.buildAuthResponse(tokens, user);
}

module.exports = {
  inviteSelfRegister,
  getSelfRegisterInfo,
  completeSelfRegister,
};
