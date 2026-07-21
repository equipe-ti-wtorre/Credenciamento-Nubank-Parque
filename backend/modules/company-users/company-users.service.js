const db = require("../../config/db");
const bcrypt = require("bcryptjs");
const AppError = require("../../utils/AppError");
const { revokeAllUserTokens } = require("../auth/token.service");
const companyService = require("../companies/company.service");
const profilesService = require("../profiles/profiles.service");
const inviteService = require("../auth/invite.service");
const {
  isSuperAdmin,
  hasPermission,
  getProfileCodigo,
} = require("../../utils/permissions");

const USER_SELECT = `u.id, u.username, u.nome_completo, u.email, u.departamento, u.id_company,
  u.id_perfil, u.is_ad_user, u.ativo, u.session_idle_minutes, u.criado_em, u.atualizado_em,
  p.codigo AS perfil_codigo, p.nome AS perfil_nome, p.requires_company, p.is_super_admin,
  c.company_name, c.fancy_name`;

function mapUserRow(row) {
  if (!row) return null;
  const profile = row.id_perfil
    ? {
        id: row.id_perfil,
        codigo: row.perfil_codigo,
        nome: row.perfil_nome,
        requires_company: !!row.requires_company,
        is_super_admin: !!row.is_super_admin,
      }
    : null;
  return {
    id: row.id,
    username: row.username,
    nome_completo: row.nome_completo,
    email: row.email,
    id_company: row.id_company != null ? row.id_company : null,
    company_name: row.company_name || row.fancy_name || null,
    id_perfil: row.id_perfil != null ? row.id_perfil : null,
    role: row.perfil_codigo || null,
    profile,
    is_ad_user: !!row.is_ad_user,
    ativo: !!row.ativo,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function assertCanManageCompanyUsers(actor) {
  if (isSuperAdmin(actor) || hasPermission(actor, "company_users", "view")) {
    return;
  }
  throw new AppError("Permissão insuficiente.", 403);
}

function resolveScopedCompanyId(actor, requestedCompanyId) {
  const codigo = getProfileCodigo(actor);
  if (codigo === "EMPRESA_GESTOR") {
    if (!actor.id_company) {
      throw new AppError("Usuário sem empresa vinculada.", 403);
    }
    if (
      requestedCompanyId != null &&
      Number(requestedCompanyId) !== Number(actor.id_company)
    ) {
      throw new AppError("Sem permissão para esta empresa.", 403);
    }
    return Number(actor.id_company);
  }

  if (isSuperAdmin(actor) || hasPermission(actor, "company_users", "view")) {
    return requestedCompanyId != null ? Number(requestedCompanyId) : null;
  }

  throw new AppError("Permissão insuficiente.", 403);
}

function assertCanWrite(actor) {
  if (isSuperAdmin(actor) || hasPermission(actor, "company_users", "create") || hasPermission(actor, "company_users", "edit")) {
    return;
  }
  throw new AppError("Permissão insuficiente.", 403);
}

function assertCanEdit(actor) {
  if (isSuperAdmin(actor) || hasPermission(actor, "company_users", "edit")) {
    return;
  }
  throw new AppError("Permissão insuficiente.", 403);
}

async function countUserLinkedData(userId) {
  const id = Number(userId);
  const [[aprovacoes]] = await db.execute(
    `SELECT COUNT(*) AS total FROM aprovacoes WHERE id_solicitante = ?`,
    [id],
  );
  const [[decisoes]] = await db.execute(
    `SELECT COUNT(*) AS total FROM aprovacao_decisoes WHERE id_usuario = ?`,
    [id],
  );
  const [[serviceAccess]] = await db.execute(
    `SELECT COUNT(*) AS total FROM service_access WHERE id_usuario = ?`,
    [id],
  );
  const [[setorUsuarios]] = await db.execute(
    `SELECT COUNT(*) AS total FROM setor_usuarios WHERE id_usuario = ?`,
    [id],
  );
  return {
    aprovacoes: Number(aprovacoes?.total) || 0,
    decisoes: Number(decisoes?.total) || 0,
    service_access: Number(serviceAccess?.total) || 0,
    setor_usuarios: Number(setorUsuarios?.total) || 0,
  };
}

function hasLinkedData(counts) {
  return (
    counts.aprovacoes > 0 ||
    counts.decisoes > 0 ||
    counts.service_access > 0 ||
    counts.setor_usuarios > 0
  );
}

function canActorDeleteCompanyUser(actor, userId) {
  if (!isSuperAdmin(actor) && !hasPermission(actor, "company_users", "edit")) {
    return false;
  }
  if (Number(actor.id) === Number(userId)) {
    return false;
  }
  return true;
}

async function enrichWithCanDelete(actor, user) {
  if (!user) return user;
  if (!canActorDeleteCompanyUser(actor, user.id)) {
    return { ...user, can_delete: false };
  }
  const counts = await countUserLinkedData(user.id);
  return { ...user, can_delete: !hasLinkedData(counts) };
}

function isEmpresaProfileCodigo(codigo) {
  return inviteService.EMPRESA_PROFILE_CODES.includes(String(codigo || "").toUpperCase());
}

async function findById(id) {
  const [rows] = await db.execute(
    `SELECT ${USER_SELECT}, u.senha_hash
     FROM usuarios u
     LEFT JOIN perfis p ON p.id = u.id_perfil
     LEFT JOIN company c ON c.id_company = u.id_company
     WHERE u.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function listCompanyUsers(actor, { page = 1, limit = 20, filters = {} }) {
  assertCanManageCompanyUsers(actor);
  const scopedCompanyId = resolveScopedCompanyId(actor, filters.id_company);

  const conditions = [
    "p.codigo IN ('EMPRESA_GESTOR', 'EMPRESA_SOLICITANTE')",
    "u.id_company IS NOT NULL",
  ];
  const params = [];

  if (scopedCompanyId) {
    conditions.push("u.id_company = ?");
    params.push(scopedCompanyId);
  }

  if (filters.search) {
    const term = `%${String(filters.search).trim()}%`;
    conditions.push("(u.nome_completo LIKE ? OR u.email LIKE ? OR u.username LIKE ?)");
    params.push(term, term, term);
  }

  if (filters.ativo !== undefined) {
    conditions.push("u.ativo = ?");
    params.push(filters.ativo ? 1 : 0);
  }

  if (filters.profile_codigo) {
    conditions.push("p.codigo = ?");
    params.push(String(filters.profile_codigo).toUpperCase());
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const offset = (page - 1) * limit;

  const [rows] = await db.execute(
    `SELECT ${USER_SELECT}
     FROM usuarios u
     INNER JOIN perfis p ON p.id = u.id_perfil
     LEFT JOIN company c ON c.id_company = u.id_company
     ${where}
     ORDER BY u.nome_completo ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM usuarios u
     INNER JOIN perfis p ON p.id = u.id_perfil
     ${where}`,
    params,
  );

  const users = await Promise.all(
    rows.map((row) => enrichWithCanDelete(actor, mapUserRow(row))),
  );

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function getCompanyUserById(actor, id) {
  assertCanManageCompanyUsers(actor);
  const row = await findById(id);
  if (!row || !isEmpresaProfileCodigo(row.perfil_codigo)) {
    throw new AppError("Usuário não encontrado.", 404);
  }
  resolveScopedCompanyId(actor, row.id_company);
  return enrichWithCanDelete(actor, mapUserRow(row));
}

async function deleteCompanyUser(actor, id) {
  assertCanEdit(actor);

  const existing = await findById(id);
  if (!existing || !isEmpresaProfileCodigo(existing.perfil_codigo)) {
    throw new AppError("Usuário não encontrado.", 404);
  }
  resolveScopedCompanyId(actor, existing.id_company);

  if (Number(actor.id) === Number(id)) {
    throw new AppError("Você não pode excluir sua própria conta.", 400);
  }

  const counts = await countUserLinkedData(id);
  if (hasLinkedData(counts)) {
    throw new AppError(
      "Não é possível excluir: há aprovações, acessos de serviço ou vínculos de setor associados a este usuário.",
      409,
    );
  }

  await revokeAllUserTokens(id);
  await db.execute("DELETE FROM usuarios WHERE id = ?", [id]);

  return {
    deleted: true,
    id: Number(id),
    email: existing.email,
    nome_completo: existing.nome_completo,
  };
}

async function createCompanyUser(actor, data, { usuarioId, requestId } = {}) {
  assertCanWrite(actor);

  const codigo = getProfileCodigo(actor);
  let idCompany = data.id_company;
  if (codigo === "EMPRESA_GESTOR") {
    idCompany = actor.id_company;
  }
  if (!idCompany) {
    throw new AppError("Informe a empresa.", 400);
  }
  resolveScopedCompanyId(actor, idCompany);

  const company = await companyService.findActiveCompanyById(idCompany);
  if (!company) throw new AppError("Empresa inválida ou inativa.", 400);

  let profileCodigo = String(data.profile_codigo || "EMPRESA_SOLICITANTE").toUpperCase();
  if (codigo === "EMPRESA_GESTOR") {
    profileCodigo = "EMPRESA_SOLICITANTE";
  }
  if (!isEmpresaProfileCodigo(profileCodigo)) {
    throw new AppError("Perfil inválido para usuário de empresa.", 400);
  }

  const email = String(data.email || "").trim().toLowerCase();
  const nome = String(data.nome_completo || "").trim();
  if (!email || !nome) {
    throw new AppError("Nome e e-mail são obrigatórios.", 400);
  }

  const sendInvite = data.send_invite !== false;

  if (sendInvite) {
    const invite = await inviteService.inviteCompanyUser({
      idCompany,
      companyName: company.company_name || company.fancy_name,
      email,
      nome,
      profileCodigo,
      usuarioId,
      requestId,
    });
    const user = await getCompanyUserById(actor, invite.id_usuario);
    return { user, invite };
  }

  if (!data.password || String(data.password).length < 8) {
    throw new AppError("Informe uma senha com no mínimo 8 caracteres ou envie convite.", 400);
  }

  const existing = await inviteService.findUserByEmail(email);
  if (existing) {
    throw new AppError("Este e-mail já está em uso.", 409);
  }

  const idPerfil = await inviteService.getEmpresaProfileId(profileCodigo);
  const username = email.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40) || `emp_${Date.now()}`;
  const senhaHash = await bcrypt.hash(String(data.password), 10);

  const [result] = await db.execute(
    `INSERT INTO usuarios
       (username, nome_completo, email, departamento, senha_hash, id_perfil, id_company, ativo, is_ad_user)
     VALUES (?, ?, ?, NULL, ?, ?, ?, 1, 0)`,
    [username, nome, email, senhaHash, idPerfil, idCompany],
  );

  const user = await getCompanyUserById(actor, result.insertId);
  return { user, invite: null };
}

async function updateCompanyUser(actor, id, data) {
  assertCanWrite(actor);
  if (!hasPermission(actor, "company_users", "edit") && !isSuperAdmin(actor)) {
    if (!hasPermission(actor, "company_users", "create")) {
      throw new AppError("Permissão insuficiente.", 403);
    }
  }

  const existing = await findById(id);
  if (!existing || !isEmpresaProfileCodigo(existing.perfil_codigo)) {
    throw new AppError("Usuário não encontrado.", 404);
  }
  resolveScopedCompanyId(actor, existing.id_company);

  const actorCodigo = getProfileCodigo(actor);
  let nextIdPerfil = existing.id_perfil;
  let nextProfileCodigo = existing.perfil_codigo;

  if (data.profile_codigo !== undefined) {
    const requested = String(data.profile_codigo).toUpperCase();
    if (actorCodigo === "EMPRESA_GESTOR" && requested !== "EMPRESA_SOLICITANTE") {
      throw new AppError("Gestor só pode atribuir o perfil de solicitações.", 403);
    }
    if (!isEmpresaProfileCodigo(requested)) {
      throw new AppError("Perfil inválido.", 400);
    }
    nextIdPerfil = await inviteService.getEmpresaProfileId(requested);
    nextProfileCodigo = requested;
  }

  let nextNome = existing.nome_completo;
  let nextEmail = existing.email;
  let nextAtivo = existing.ativo;
  let passwordChanged = false;
  let senhaHash = existing.senha_hash;

  if (data.nome_completo !== undefined) {
    nextNome = String(data.nome_completo).trim() || nextNome;
  }
  if (data.email !== undefined) {
    nextEmail = String(data.email).trim().toLowerCase();
    const other = await inviteService.findUserByEmail(nextEmail);
    if (other && Number(other.id) !== Number(id)) {
      throw new AppError("Este e-mail já está em uso.", 409);
    }
  }
  if (data.ativo !== undefined) {
    nextAtivo = data.ativo ? 1 : 0;
  }
  if (data.password !== undefined && String(data.password).length > 0) {
    if (String(data.password).length < 8) {
      throw new AppError("A senha deve ter no mínimo 8 caracteres.", 400);
    }
    senhaHash = await bcrypt.hash(String(data.password), 10);
    passwordChanged = true;
  }

  if (actor.id === Number(id) && nextAtivo === 0) {
    throw new AppError("Você não pode bloquear sua própria conta.", 400);
  }

  await db.execute(
    `UPDATE usuarios
     SET id_perfil = ?, nome_completo = ?, email = ?, username = ?, ativo = ?, senha_hash = ?
     WHERE id = ?`,
    [
      nextIdPerfil,
      nextNome,
      nextEmail,
      nextEmail.split("@")[0],
      nextAtivo,
      senhaHash,
      id,
    ],
  );

  if (nextAtivo === 0 && existing.ativo === 1) {
    await revokeAllUserTokens(id);
  } else if (passwordChanged || nextProfileCodigo !== existing.perfil_codigo) {
    await revokeAllUserTokens(id);
  }

  return {
    user: await getCompanyUserById(actor, id),
    changes: {
      ativoChanged: Boolean(existing.ativo) !== Boolean(nextAtivo),
      wasActivated: !existing.ativo && !!nextAtivo,
      wasDeactivated: !!existing.ativo && !nextAtivo,
      passwordChanged,
      profileChanged: nextProfileCodigo !== existing.perfil_codigo,
    },
  };
}

async function resendInvite(actor, id, { usuarioId, requestId } = {}) {
  assertCanWrite(actor);
  const existing = await findById(id);
  if (!existing || !isEmpresaProfileCodigo(existing.perfil_codigo)) {
    throw new AppError("Usuário não encontrado.", 404);
  }
  resolveScopedCompanyId(actor, existing.id_company);

  const company = await companyService.findCompanyById(existing.id_company);
  if (!company) throw new AppError("Empresa não encontrada.", 404);

  const invite = await inviteService.inviteCompanyUser({
    idCompany: existing.id_company,
    companyName: company.company_name || company.fancy_name,
    email: existing.email,
    nome: existing.nome_completo,
    profileCodigo: existing.perfil_codigo,
    usuarioId,
    requestId,
  });

  return { user: await getCompanyUserById(actor, id), invite };
}

function parseListQuery(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit };
}

function parseListFilters(query) {
  const filters = {};
  if (query.search) filters.search = String(query.search).trim();
  if (query.id_company != null && query.id_company !== "") {
    filters.id_company = parseInt(query.id_company, 10);
  }
  if (query.profile_codigo) {
    filters.profile_codigo = String(query.profile_codigo).trim().toUpperCase();
  }
  if (query.ativo !== undefined && query.ativo !== "") {
    filters.ativo =
      String(query.ativo).toLowerCase() === "true" || query.ativo === "1";
  }
  return filters;
}

module.exports = {
  listCompanyUsers,
  getCompanyUserById,
  createCompanyUser,
  updateCompanyUser,
  deleteCompanyUser,
  resendInvite,
  parseListQuery,
  parseListFilters,
};
