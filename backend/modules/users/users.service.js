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

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    nome_completo: row.nome_completo,
    email: row.email,
    departamento: row.departamento || null,
    id_company: row.id_company != null ? row.id_company : null,
    role: row.perfil,
    is_ad_user: !!row.is_ad_user,
    ativo: !!row.ativo,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function buildListWhere(filters) {
  const conditions = [SQL_HAS_DEPARTMENT, "ativo = 1"];
  const params = [];

  if (filters.search) {
    const term = `%${String(filters.search).trim()}%`;
    conditions.push("(nome_completo LIKE ? OR email LIKE ? OR username LIKE ?)");
    params.push(term, term, term);
  }

  const allowedPerfis = ["ADMIN", "USER", "PRODUTORA", "PADRAO"];
  if (allowedPerfis.includes(filters.perfil)) {
    conditions.push("perfil = ?");
    params.push(filters.perfil);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  return { where, params };
}

async function countActiveAdmins(excludeId = null) {
  let sql = `SELECT COUNT(*) AS total FROM usuarios WHERE perfil = 'ADMIN' AND ativo = 1 AND ${SQL_HAS_DEPARTMENT}`;
  const params = [];
  if (excludeId != null) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  const [[{ total }]] = await db.execute(sql, params);
  return total;
}

async function findById(id) {
  const [rows] = await db.execute("SELECT * FROM usuarios WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

async function listUsers({ page = 1, limit = 20, filters = {} }) {
  const offset = (page - 1) * limit;
  const { where, params } = buildListWhere(filters);

  const [rows] = await db.execute(
    `SELECT id, username, nome_completo, email, departamento, id_company, perfil, is_ad_user, ativo, criado_em, atualizado_em
     FROM usuarios ${where}
     ORDER BY nome_completo ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) AS total FROM usuarios ${where}`,
    params,
  );

  return {
    users: rows.map(mapUserRow),
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

  const nextPerfil = data.perfil !== undefined ? data.perfil : existing.perfil;
  const nextAtivo = data.ativo !== undefined ? (data.ativo ? 1 : 0) : existing.ativo;
  let nextEmail = existing.email;
  let nextNome = existing.nome_completo;
  let nextUsername = existing.username;
  let nextDepartamento = existing.departamento;
  let nextIdCompany =
    existing.id_company != null ? existing.id_company : null;
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

  if (
    (nextPerfil === "PRODUTORA" || nextPerfil === "PADRAO") &&
    !nextIdCompany
  ) {
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

  if (!hasValidDepartment(nextDepartamento)) {
    throw new AppError("Departamento é obrigatório para acesso ao sistema.", 400);
  }

  if (actorId === id && nextAtivo === 0) {
    throw new AppError("Você não pode bloquear sua própria conta.", 400);
  }

  const isDemotingAdmin =
    existing.perfil === "ADMIN" && (nextPerfil === "USER" || nextAtivo === 0);
  if (isDemotingAdmin) {
    const activeAdmins = await countActiveAdmins();
    if (activeAdmins <= 1) {
      throw new AppError("Não é possível rebaixar ou bloquear o último administrador ativo.", 400);
    }
  }

  let senhaHash = existing.senha_hash;
  if (isLocal && data.password !== undefined && String(data.password).length > 0) {
    senhaHash = await bcrypt.hash(data.password, 10);
    passwordChanged = true;
  }

  const idCompanyChanged =
    (existing.id_company ?? null) !== (nextIdCompany ?? null);

  if (isLocal) {
    await db.execute(
      `UPDATE usuarios SET perfil = ?, ativo = ?, email = ?, username = ?, nome_completo = ?, departamento = ?, id_company = ?, senha_hash = ? WHERE id = ?`,
      [
        nextPerfil,
        nextAtivo,
        nextEmail,
        nextUsername,
        nextNome,
        nextDepartamento,
        nextIdCompany,
        senhaHash,
        id,
      ],
    );
  } else {
    await db.execute(
      "UPDATE usuarios SET perfil = ?, ativo = ?, id_company = ? WHERE id = ?",
      [nextPerfil, nextAtivo, nextIdCompany, id],
    );
  }

  if (nextAtivo === 0 && existing.ativo === 1) {
    await revokeAllUserTokens(id);
  } else if (passwordChanged || idCompanyChanged || existing.perfil !== nextPerfil) {
    await revokeAllUserTokens(id);
  }

  const updated = await findById(id);
  return {
    user: mapUserRow(updated),
    changes: {
      perfilChanged: existing.perfil !== nextPerfil,
      ativoChanged: existing.ativo !== nextAtivo,
      emailChanged: isLocal && existing.email !== nextEmail,
      passwordChanged,
      wasActivated: existing.ativo === 0 && nextAtivo === 1,
      wasDeactivated: existing.ativo === 1 && nextAtivo === 0,
      idCompanyChanged,
    },
  };
}

function parseListQuery(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit };
}

function parseListFilters(query) {
  return {
    search: query.search,
    perfil: query.perfil,
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
