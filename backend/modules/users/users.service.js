const db = require("../../config/db");
const bcrypt = require("bcryptjs");
const AppError = require("../../utils/AppError");
const { revokeAllUserTokens } = require("../auth/token.service");
const {
  syncUserProfileFromGraph,
  syncMissingDepartments,
} = require("../../utils/userProfileSync");
const { SQL_HAS_DEPARTMENT, hasValidDepartment } = require("../../utils/userDepartment");
const companyService = require("../companies/company.service");
const profilesService = require("../profiles/profiles.service");

const MIN_SESSION_IDLE_MINUTES = 5;
const MAX_SESSION_IDLE_MINUTES = 480;

function normalizeSessionIdleMinutes(value) {
  if (value === null || value === undefined) return null;
  const minutes = Number(value);
  if (minutes === 0) return 0;
  if (
    Number.isInteger(minutes) &&
    minutes >= MIN_SESSION_IDLE_MINUTES &&
    minutes <= MAX_SESSION_IDLE_MINUTES
  ) {
    return minutes;
  }
  throw new AppError(
    "Logout por inatividade deve ser 0 (desativado), omitido (padrão do sistema) ou entre 5 e 480 minutos.",
    400,
  );
}

async function mapUserRow(row) {
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
    departamento: row.departamento || null,
    id_company: row.id_company != null ? row.id_company : null,
    id_perfil: row.id_perfil != null ? row.id_perfil : null,
    role: row.perfil_codigo || "USER",
    profile,
    is_ad_user: !!row.is_ad_user,
    ativo: !!row.ativo,
    session_idle_minutes:
      row.session_idle_minutes != null ? row.session_idle_minutes : null,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

const USER_SELECT = `u.id, u.username, u.nome_completo, u.email, u.departamento, u.id_company,
  u.id_perfil, u.is_ad_user, u.ativo, u.session_idle_minutes, u.criado_em, u.atualizado_em,
  p.codigo AS perfil_codigo, p.nome AS perfil_nome, p.requires_company, p.is_super_admin`;

function buildListWhere(filters) {
  const conditions = [
    SQL_HAS_DEPARTMENT.replace(/departamento/g, "u.departamento"),
    "u.ativo = 1",
    "(p.codigo IS NULL OR p.codigo NOT IN ('EMPRESA_GESTOR', 'EMPRESA_SOLICITANTE'))",
  ];
  const params = [];

  if (filters.search) {
    const term = `%${String(filters.search).trim()}%`;
    conditions.push("(u.nome_completo LIKE ? OR u.email LIKE ? OR u.username LIKE ?)");
    params.push(term, term, term);
  }

  if (filters.id_perfil) {
    conditions.push("u.id_perfil = ?");
    params.push(filters.id_perfil);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  return { where, params };
}

async function countActiveSuperAdmins(excludeId = null) {
  return profilesService.countActiveSuperAdmins(excludeId);
}

async function findById(id) {
  const [rows] = await db.execute(
    `SELECT u.*, p.codigo AS perfil_codigo, p.nome AS perfil_nome, p.requires_company, p.is_super_admin
     FROM usuarios u
     LEFT JOIN perfis p ON p.id = u.id_perfil
     WHERE u.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function listUsers({ page = 1, limit = 20, filters = {} }) {
  const offset = (page - 1) * limit;
  const { where, params } = buildListWhere(filters);

  const [rows] = await db.execute(
    `SELECT ${USER_SELECT}
     FROM usuarios u
     LEFT JOIN perfis p ON p.id = u.id_perfil
     ${where}
     ORDER BY u.nome_completo ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) AS total FROM usuarios u LEFT JOIN perfis p ON p.id = u.id_perfil ${where}`,
    params,
  );

  const users = [];
  for (const row of rows) {
    users.push(await mapUserRow(row));
  }

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

async function getUserById(id) {
  const row = await findById(id);
  if (!row) throw new AppError("Usuário não encontrado.", 404);
  return mapUserRow(row);
}

async function emailEmUso(email, excludeId = null) {
  let sql = "SELECT id FROM usuarios WHERE email = ?";
  const params = [email];
  if (excludeId != null) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  sql += " LIMIT 1";
  const [rows] = await db.execute(sql, params);
  return rows.length > 0;
}

async function resolveProfile(idPerfil) {
  const profile = await profilesService.getProfileById(idPerfil);
  if (!profile || !profile.ativo) {
    throw new AppError("Perfil inválido ou inativo.", 400);
  }
  return profile;
}

async function updateUser(id, data, actorId) {
  const existing = await findById(id);
  if (!existing) throw new AppError("Usuário não encontrado.", 404);

  const isLocal = !existing.is_ad_user;

  if (!isLocal && (data.email !== undefined || data.password !== undefined)) {
    throw new AppError(
      "E-mail e senha de usuários Microsoft são gerenciados pelo Azure AD.",
      400,
    );
  }

  const nextIdPerfil =
    data.id_perfil !== undefined ? data.id_perfil : existing.id_perfil;
  const nextProfile =
    nextIdPerfil != null ? await resolveProfile(nextIdPerfil) : null;

  const nextAtivo = data.ativo !== undefined ? (data.ativo ? 1 : 0) : existing.ativo;
  let nextEmail = existing.email;
  let nextNome = existing.nome_completo;
  let nextUsername = existing.username;
  let nextDepartamento = existing.departamento;
  let nextIdCompany =
    existing.id_company != null ? existing.id_company : null;
  let nextSessionIdleMinutes =
    existing.session_idle_minutes != null ? existing.session_idle_minutes : null;
  let passwordChanged = false;

  if (data.id_company !== undefined) {
    if (data.id_company === null) {
      nextIdCompany = null;
    } else {
      const company = await companyService.findActiveCompanyById(data.id_company);
      if (!company) {
        throw new AppError("Empresa inválida ou inativa.", 400);
      }
      nextIdCompany = data.id_company;
    }
  }

  if (nextProfile?.requires_company && !nextIdCompany) {
    throw new AppError("Perfil exige vínculo com uma empresa ativa.", 400);
  }

  if (isLocal && data.departamento !== undefined) {
    nextDepartamento = String(data.departamento).trim() || null;
  }

  if (isLocal && data.email !== undefined) {
    const email = String(data.email).trim().toLowerCase();
    if (await emailEmUso(email, id)) {
      throw new AppError("Este e-mail já está em uso por outro usuário.", 409);
    }
    nextEmail = email;
    nextUsername = email.split("@")[0];
  }

  if (isLocal && data.nome_completo !== undefined) {
    nextNome = String(data.nome_completo).trim() || nextNome;
  }

  if (data.session_idle_minutes !== undefined) {
    nextSessionIdleMinutes = normalizeSessionIdleMinutes(data.session_idle_minutes);
  }

  if (!hasValidDepartment(nextDepartamento)) {
    throw new AppError("Departamento é obrigatório para acesso ao sistema.", 400);
  }

  if (actorId === id && nextAtivo === 0) {
    throw new AppError("Você não pode bloquear sua própria conta.", 400);
  }

  const wasSuperAdmin = !!existing.is_super_admin;
  const willBeSuperAdmin = !!nextProfile?.is_super_admin;
  const isDemotingSuperAdmin =
    wasSuperAdmin && (!willBeSuperAdmin || nextAtivo === 0);
  if (isDemotingSuperAdmin) {
    const activeSuperAdmins = await countActiveSuperAdmins();
    if (activeSuperAdmins <= 1) {
      throw new AppError(
        "Não é possível rebaixar ou bloquear o último administrador ativo.",
        400,
      );
    }
  }

  let senhaHash = existing.senha_hash;
  if (isLocal && data.password !== undefined && String(data.password).length > 0) {
    senhaHash = await bcrypt.hash(data.password, 10);
    passwordChanged = true;
  }

  const idCompanyChanged =
    (existing.id_company ?? null) !== (nextIdCompany ?? null);
  const profileChanged = (existing.id_perfil ?? null) !== (nextIdPerfil ?? null);

  if (isLocal) {
    await db.execute(
      `UPDATE usuarios SET id_perfil = ?, ativo = ?, email = ?, username = ?, nome_completo = ?, departamento = ?, id_company = ?, session_idle_minutes = ?, senha_hash = ? WHERE id = ?`,
      [
        nextIdPerfil,
        nextAtivo,
        nextEmail,
        nextUsername,
        nextNome,
        nextDepartamento,
        nextIdCompany,
        nextSessionIdleMinutes,
        senhaHash,
        id,
      ],
    );
  } else {
    await db.execute(
      "UPDATE usuarios SET id_perfil = ?, ativo = ?, id_company = ?, session_idle_minutes = ? WHERE id = ?",
      [nextIdPerfil, nextAtivo, nextIdCompany, nextSessionIdleMinutes, id],
    );
  }

  if (nextAtivo === 0 && existing.ativo === 1) {
    await revokeAllUserTokens(id);
  } else if (passwordChanged || idCompanyChanged || profileChanged) {
    await revokeAllUserTokens(id);
  }

  const updated = await findById(id);
  return {
    user: await mapUserRow(updated),
    changes: {
      profileChanged,
      ativoChanged: existing.ativo !== nextAtivo,
      emailChanged: isLocal && existing.email !== nextEmail,
      passwordChanged,
      wasActivated: existing.ativo === 0 && nextAtivo === 1,
      wasDeactivated: existing.ativo === 1 && nextAtivo === 0,
      idCompanyChanged,
      sessionIdleChanged:
        (existing.session_idle_minutes ?? null) !== (nextSessionIdleMinutes ?? null),
    },
  };
}

function parseListQuery(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit };
}

function parseListFilters(query) {
  const idPerfil = query.id_perfil ? parseInt(query.id_perfil, 10) : null;
  return {
    search: query.search,
    id_perfil: Number.isInteger(idPerfil) && idPerfil > 0 ? idPerfil : undefined,
  };
}

async function syncDepartments() {
  return syncMissingDepartments({ limit: 100 });
}

async function syncAdUsers() {
  const { runAdUsersSync } = require("../../utils/adUsersSync");
  return runAdUsersSync({ triggeredBy: "api" });
}

async function syncUserDepartment(id) {
  const row = await findById(id);
  if (!row) throw new AppError("Usuário não encontrado.", 404);
  if (!row.is_ad_user || !row.microsoft_id) {
    throw new AppError("Usuário local não possui perfil no Azure AD.", 400);
  }

  const result = await syncUserProfileFromGraph(row.id, row.microsoft_id);
  if (!result.ok) {
    throw new AppError(result.message || "Falha ao sincronizar perfil Microsoft.", 502);
  }

  const updated = await findById(id);
  return mapUserRow(updated);
}

module.exports = {
  listUsers,
  getUserById,
  updateUser,
  syncDepartments,
  syncAdUsers,
  syncUserDepartment,
  parseListQuery,
  parseListFilters,
};
