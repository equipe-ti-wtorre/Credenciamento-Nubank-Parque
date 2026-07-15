const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const {
  ACTIONS,
  MODULE_KEYS,
  getModulesCatalog,
  permissionKey,
} = require("../../config/modules.config");

function revokeAllUserTokens(userId) {
  const { revokeAllUserTokens: revoke } = require("../auth/token.service");
  return revoke(userId);
}

function mapProfileRow(row, permissions = [], userCount = 0) {
  if (!row) return null;
  return {
    id: row.id,
    codigo: row.codigo,
    nome: row.nome,
    descricao: row.descricao || null,
    is_system: !!row.is_system,
    is_super_admin: !!row.is_super_admin,
    requires_company: !!row.requires_company,
    ativo: !!row.ativo,
    user_count: userCount,
    permissions,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function normalizePermissions(permissions) {
  const seen = new Set();
  const normalized = [];
  for (const perm of permissions || []) {
    const modulo = String(perm.modulo || "").trim();
    const acao = String(perm.acao || "").trim();
    if (!MODULE_KEYS.includes(modulo) || !ACTIONS.includes(acao)) continue;
    const key = permissionKey(modulo, acao);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ modulo, acao });
  }
  return normalized;
}

function generateCodigo(nome) {
  const base = String(nome || "perfil")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .slice(0, 40) || "PERFIL";
  return `${base}_${Date.now().toString(36).toUpperCase()}`;
}

async function loadPermissionsForProfile(idPerfil) {
  const [rows] = await db.execute(
    "SELECT modulo, acao FROM perfil_permissoes WHERE id_perfil = ? ORDER BY modulo, acao",
    [idPerfil],
  );
  return rows;
}

async function countUsersByProfile(idPerfil) {
  const [[{ total }]] = await db.execute(
    "SELECT COUNT(*) AS total FROM usuarios WHERE id_perfil = ? AND ativo = 1",
    [idPerfil],
  );
  return total;
}

async function findById(id) {
  const [rows] = await db.execute("SELECT * FROM perfis WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

async function listProfiles() {
  const [rows] = await db.execute(
    `SELECT p.*, (
       SELECT COUNT(*) FROM usuarios u WHERE u.id_perfil = p.id AND u.ativo = 1
     ) AS user_count
     FROM perfis p
     ORDER BY p.is_system DESC, p.nome ASC`,
  );

  const profiles = [];
  for (const row of rows) {
    const permissions = await loadPermissionsForProfile(row.id);
    profiles.push(mapProfileRow(row, permissions, row.user_count));
  }
  return profiles;
}

async function getProfileById(id) {
  const row = await findById(id);
  if (!row) throw new AppError("Perfil não encontrado.", 404);
  const permissions = await loadPermissionsForProfile(id);
  const userCount = await countUsersByProfile(id);
  return mapProfileRow(row, permissions, userCount);
}

async function replacePermissions(idPerfil, permissions, connection = null) {
  const conn = connection || db;
  const normalized = normalizePermissions(permissions);
  if (normalized.length === 0) {
    throw new AppError("Informe ao menos uma permissão válida.", 400);
  }

  await conn.execute("DELETE FROM perfil_permissoes WHERE id_perfil = ?", [idPerfil]);
  for (const perm of normalized) {
    await conn.execute(
      "INSERT INTO perfil_permissoes (id_perfil, modulo, acao) VALUES (?, ?, ?)",
      [idPerfil, perm.modulo, perm.acao],
    );
  }
}

async function revokeUsersOfProfile(idPerfil) {
  const [users] = await db.execute("SELECT id FROM usuarios WHERE id_perfil = ?", [idPerfil]);
  for (const user of users) {
    await revokeAllUserTokens(user.id);
  }
}

async function createProfile(data) {
  const codigo = generateCodigo(data.nome);
  const permissions = normalizePermissions(data.permissions);
  if (permissions.length === 0) {
    throw new AppError("Informe ao menos uma permissão válida.", 400);
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO perfis (codigo, nome, descricao, is_system, is_super_admin, requires_company, ativo)
       VALUES (?, ?, ?, 0, 0, ?, 1)`,
      [
        codigo,
        data.nome.trim(),
        data.descricao ? String(data.descricao).trim() : null,
        data.requires_company ? 1 : 0,
      ],
    );
    await replacePermissions(result.insertId, permissions, connection);
    await connection.commit();
    return getProfileById(result.insertId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function updateProfile(id, data) {
  const existing = await findById(id);
  if (!existing) throw new AppError("Perfil não encontrado.", 404);

  const nextNome = data.nome !== undefined ? data.nome.trim() : existing.nome;
  const nextDescricao =
    data.descricao !== undefined
      ? data.descricao
        ? String(data.descricao).trim()
        : null
      : existing.descricao;
  const nextRequiresCompany =
    data.requires_company !== undefined
      ? data.requires_company
        ? 1
        : 0
      : existing.requires_company;
  const nextAtivo = data.ativo !== undefined ? (data.ativo ? 1 : 0) : existing.ativo;

  if (existing.is_super_admin && nextAtivo === 0) {
    throw new AppError("Não é possível desativar o perfil de super administrador.", 400);
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE perfis SET nome = ?, descricao = ?, requires_company = ?, ativo = ? WHERE id = ?`,
      [nextNome, nextDescricao, nextRequiresCompany, nextAtivo, id],
    );

    if (data.permissions !== undefined) {
      await replacePermissions(id, data.permissions, connection);
      await revokeUsersOfProfile(id);
    }

    await connection.commit();
    return getProfileById(id);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function deleteProfile(id) {
  const existing = await findById(id);
  if (!existing) throw new AppError("Perfil não encontrado.", 404);
  if (existing.is_system) {
    throw new AppError("Perfis do sistema não podem ser excluídos.", 400);
  }

  const userCount = await countUsersByProfile(id);
  if (userCount > 0) {
    throw new AppError("Não é possível excluir perfil com usuários vinculados.", 400);
  }

  await db.execute("DELETE FROM perfis WHERE id = ?", [id]);
}

async function getProfileByCodigo(codigo) {
  const [rows] = await db.execute("SELECT * FROM perfis WHERE codigo = ? LIMIT 1", [codigo]);
  return rows[0] || null;
}

async function loadUserProfileContext(userId) {
  const [rows] = await db.execute(
    `SELECT u.id, u.ativo, u.departamento, u.id_company, u.id_perfil,
            p.codigo, p.nome AS perfil_nome, p.is_super_admin, p.requires_company
     FROM usuarios u
     LEFT JOIN perfis p ON p.id = u.id_perfil
     WHERE u.id = ? LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;

  let permissions = [];
  if (row.id_perfil) {
    permissions = await loadPermissionsForProfile(row.id_perfil);
  }

  return {
    id: row.id,
    ativo: row.ativo,
    departamento: row.departamento,
    id_company: row.id_company != null ? row.id_company : null,
    id_perfil: row.id_perfil,
    codigo: row.codigo || "USER",
    perfil_nome: row.perfil_nome || "Usuário",
    is_super_admin: !!row.is_super_admin,
    requires_company: !!row.requires_company,
    permissions: permissions.map((p) => permissionKey(p.modulo, p.acao)),
  };
}

module.exports = {
  listProfiles,
  getProfileById,
  createProfile,
  updateProfile,
  deleteProfile,
  getModulesCatalog,
  getProfileByCodigo,
  loadUserProfileContext,
  countActiveSuperAdmins: async (excludeUserId = null) => {
    let sql = `SELECT COUNT(*) AS total FROM usuarios u
               INNER JOIN perfis p ON p.id = u.id_perfil
               WHERE p.is_super_admin = 1 AND u.ativo = 1`;
    const params = [];
    if (excludeUserId != null) {
      sql += " AND u.id != ?";
      params.push(excludeUserId);
    }
    const [[{ total }]] = await db.execute(sql, params);
    return total;
  },
};
