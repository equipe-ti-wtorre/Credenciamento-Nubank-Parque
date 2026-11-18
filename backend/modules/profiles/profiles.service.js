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

function mapProfileRow(row, permissions = [], userCount = 0, teamCount = 0) {
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
    user_count: Number(userCount) || 0,
    team_count: Number(teamCount) || 0,
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

const EFFECTIVE_USER_COUNT_SQL = `
  SELECT COUNT(DISTINCT u.id) AS total
  FROM usuarios u
  WHERE u.ativo = 1
    AND (
      u.id_perfil = ?
      OR EXISTS (
        SELECT 1
        FROM setor_usuarios su
        INNER JOIN perfil_setores ps ON ps.id_setor = su.id_setor AND ps.id_perfil = ?
        INNER JOIN setores s ON s.id = su.id_setor AND s.ativo = 1
        WHERE su.id_usuario = u.id AND su.ativo = 1
      )
    )`;

async function countUsersByProfile(idPerfil, connection = null) {
  const conn = connection || db;
  const [[{ total }]] = await conn.execute(EFFECTIVE_USER_COUNT_SQL, [idPerfil, idPerfil]);
  return Number(total) || 0;
}

async function countDirectUsersByProfile(idPerfil, connection = null) {
  const conn = connection || db;
  const [[{ total }]] = await conn.execute(
    "SELECT COUNT(*) AS total FROM usuarios WHERE id_perfil = ? AND ativo = 1",
    [idPerfil],
  );
  return Number(total) || 0;
}

async function countTeamsByProfile(idPerfil, connection = null) {
  const conn = connection || db;
  const [[{ total }]] = await conn.execute(
    "SELECT COUNT(*) AS total FROM perfil_setores WHERE id_perfil = ?",
    [idPerfil],
  );
  return Number(total) || 0;
}

function mapProfileUserRow(row) {
  return {
    id: row.id,
    public_id: row.public_id,
    nome_completo: row.nome_completo,
    email: row.email,
    departamento: row.departamento || null,
    company_nome: row.company_nome || null,
  };
}

async function listUsersByProfile(idPerfil) {
  const [rows] = await db.execute(
    `SELECT u.id, u.public_id, u.nome_completo, u.email, u.departamento,
            COALESCE(NULLIF(TRIM(c.fancy_name), ''), c.company_name) AS company_nome
     FROM usuarios u
     LEFT JOIN company c ON c.id_company = u.id_company
     WHERE u.id_perfil = ? AND u.ativo = 1
     ORDER BY u.nome_completo ASC`,
    [idPerfil],
  );
  return rows.map(mapProfileUserRow);
}

async function listTeamsByProfile(idPerfil, connection = null) {
  const conn = connection || db;
  const [rows] = await conn.execute(
    `SELECT s.id, s.public_id, s.nome,
            (SELECT COUNT(*) FROM setor_usuarios su
              WHERE su.id_setor = s.id AND su.ativo = 1) AS membros_ativos
     FROM perfil_setores ps
     INNER JOIN setores s ON s.id = ps.id_setor
     WHERE ps.id_perfil = ?
     ORDER BY s.nome ASC`,
    [idPerfil],
  );
  return rows.map((row) => ({
    id: row.id,
    public_id: row.public_id,
    nome: row.nome,
    membros_ativos: Number(row.membros_ativos) || 0,
  }));
}

function normalizeIdList(ids) {
  const seen = new Set();
  const normalized = [];
  for (const raw of ids || []) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Identificador inválido.", 400);
    }
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

async function assertActiveIds(connection, table, ids, message) {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await connection.execute(
    `SELECT id FROM ${table} WHERE ativo = 1 AND id IN (${placeholders})`,
    ids,
  );
  if (rows.length !== ids.length) {
    throw new AppError(message, 400);
  }
}

async function assertSuperAdminRemains(idPerfil, nextUserIds, connection) {
  const [[{ others }]] = await connection.execute(
    `SELECT COUNT(*) AS others
     FROM usuarios u
     INNER JOIN perfis p ON p.id = u.id_perfil
     WHERE p.is_super_admin = 1 AND u.ativo = 1 AND u.id_perfil <> ?`,
    [idPerfil],
  );
  let overlap = 0;
  if (nextUserIds.length > 0) {
    const placeholders = nextUserIds.map(() => "?").join(",");
    const [[{ total }]] = await connection.execute(
      `SELECT COUNT(*) AS total
       FROM usuarios u
       INNER JOIN perfis p ON p.id = u.id_perfil
       WHERE p.is_super_admin = 1 AND u.ativo = 1 AND u.id_perfil <> ?
         AND u.id IN (${placeholders})`,
      [idPerfil, ...nextUserIds],
    );
    overlap = Number(total) || 0;
  }
  const nextTotal = (Number(others) || 0) - overlap + nextUserIds.length;
  if (nextTotal < 1) {
    throw new AppError("Não é possível rebaixar ou bloquear o último administrador ativo.", 400);
  }
}

async function syncProfileUsers(idPerfil, userIds, connection, profile) {
  const ids = normalizeIdList(userIds);
  await assertActiveIds(
    connection,
    "usuarios",
    ids,
    "Um ou mais usuários não existem ou estão inativos.",
  );

  if (profile.codigo === "USER") {
    const [currentRows] = await connection.execute(
      "SELECT id FROM usuarios WHERE id_perfil = ? AND ativo = 1",
      [idPerfil],
    );
    const nextIds = new Set(ids);
    const removed = currentRows.some((row) => !nextIds.has(row.id));
    if (removed) {
      throw new AppError("Não é possível desvincular usuários do perfil padrão.", 400);
    }
  }

  if (profile.is_super_admin) {
    await assertSuperAdminRemains(idPerfil, ids, connection);
  } else if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    const [[{ moving }]] = await connection.execute(
      `SELECT COUNT(*) AS moving
       FROM usuarios u
       INNER JOIN perfis p ON p.id = u.id_perfil
       WHERE p.is_super_admin = 1 AND u.ativo = 1 AND u.id IN (${placeholders})`,
      ids,
    );
    const [[{ remaining }]] = await connection.execute(
      `SELECT COUNT(*) AS remaining
       FROM usuarios u
       INNER JOIN perfis p ON p.id = u.id_perfil
       WHERE p.is_super_admin = 1 AND u.ativo = 1 AND u.id NOT IN (${placeholders})`,
      ids,
    );
    if ((Number(moving) || 0) > 0 && (Number(remaining) || 0) < 1) {
      throw new AppError("Não é possível rebaixar ou bloquear o último administrador ativo.", 400);
    }
  }

  const userProfile = await getProfileByCodigo("USER");
  if (!userProfile) {
    throw new AppError("Perfil padrão USER não encontrado.", 500);
  }

  if (ids.length === 0) {
    await connection.execute(
      "UPDATE usuarios SET id_perfil = ? WHERE id_perfil = ? AND ativo = 1",
      [userProfile.id, idPerfil],
    );
    return;
  }

  const placeholders = ids.map(() => "?").join(",");
  await connection.execute(
    `UPDATE usuarios SET id_perfil = ? WHERE id_perfil = ? AND ativo = 1 AND id NOT IN (${placeholders})`,
    [userProfile.id, idPerfil, ...ids],
  );
  await connection.execute(
    `UPDATE usuarios SET id_perfil = ? WHERE ativo = 1 AND id IN (${placeholders})`,
    [idPerfil, ...ids],
  );
}

async function syncProfileTeams(idPerfil, setorIds, connection, profile) {
  const ids = normalizeIdList(setorIds);
  if (profile.is_super_admin && ids.length > 0) {
    throw new AppError("Não é possível vincular um time ao perfil de super administrador.", 400);
  }
  await assertActiveIds(
    connection,
    "setores",
    ids,
    "Um ou mais times não existem ou estão inativos.",
  );

  await connection.execute("DELETE FROM perfil_setores WHERE id_perfil = ?", [idPerfil]);
  for (const idSetor of ids) {
    await connection.execute(
      "INSERT INTO perfil_setores (id_perfil, id_setor) VALUES (?, ?)",
      [idPerfil, idSetor],
    );
  }
}

async function findById(id) {
  const [rows] = await db.execute("SELECT * FROM perfis WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

async function listProfiles() {
  const [rows] = await db.execute(
    `SELECT p.*, (
       SELECT COUNT(DISTINCT u.id)
       FROM usuarios u
       WHERE u.ativo = 1
         AND (
           u.id_perfil = p.id
           OR EXISTS (
             SELECT 1
             FROM setor_usuarios su
             INNER JOIN perfil_setores ps ON ps.id_setor = su.id_setor AND ps.id_perfil = p.id
             INNER JOIN setores s ON s.id = su.id_setor AND s.ativo = 1
             WHERE su.id_usuario = u.id AND su.ativo = 1
           )
         )
     ) AS user_count,
     (
       SELECT COUNT(*) FROM perfil_setores pst WHERE pst.id_perfil = p.id
     ) AS team_count
     FROM perfis p
     ORDER BY p.is_system DESC, p.nome ASC`,
  );

  const profiles = [];
  for (const row of rows) {
    const permissions = await loadPermissionsForProfile(row.id);
    profiles.push(mapProfileRow(row, permissions, row.user_count, row.team_count));
  }
  return profiles;
}

async function getProfileById(id) {
  const row = await findById(id);
  if (!row) throw new AppError("Perfil não encontrado.", 404);
  const permissions = await loadPermissionsForProfile(id);
  const [userCount, users, teams] = await Promise.all([
    countUsersByProfile(id),
    listUsersByProfile(id),
    listTeamsByProfile(id),
  ]);
  return { ...mapProfileRow(row, permissions, userCount, teams.length), users, teams };
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

async function listAffectedUserIds(idPerfil, connection = null) {
  const conn = connection || db;
  const [users] = await conn.execute(
    `SELECT DISTINCT u.id
     FROM usuarios u
     WHERE u.id_perfil = ?
        OR u.id IN (
          SELECT su.id_usuario
          FROM setor_usuarios su
          INNER JOIN perfil_setores ps ON ps.id_setor = su.id_setor
          INNER JOIN setores s ON s.id = su.id_setor AND s.ativo = 1
          WHERE ps.id_perfil = ? AND su.ativo = 1
        )`,
    [idPerfil, idPerfil],
  );
  return users.map((user) => user.id);
}

async function revokeUsersOfProfile(idPerfil, connection = null) {
  const ids = await listAffectedUserIds(idPerfil, connection);
  for (const userId of ids) {
    await revokeAllUserTokens(userId);
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
    const created = { ...data, id: result.insertId, codigo, is_super_admin: 0 };
    if (data.usuarios_ids !== undefined) {
      await syncProfileUsers(result.insertId, data.usuarios_ids, connection, created);
    }
    if (data.setores_ids !== undefined) {
      await syncProfileTeams(result.insertId, data.setores_ids, connection, created);
    }
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
    }
    if (data.usuarios_ids !== undefined) {
      await syncProfileUsers(id, data.usuarios_ids, connection, existing);
    }
    if (data.setores_ids !== undefined) {
      await syncProfileTeams(id, data.setores_ids, connection, existing);
    }
    if (data.permissions !== undefined) {
      await revokeUsersOfProfile(id, connection);
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

  const directCount = await countDirectUsersByProfile(id);
  const teamCount = await countTeamsByProfile(id);
  if (directCount > 0 || teamCount > 0) {
    throw new AppError("Não é possível excluir perfil com usuários ou times vinculados.", 400);
  }

  await db.execute("DELETE FROM perfis WHERE id = ?", [id]);
}

async function getProfileByCodigo(codigo) {
  const [rows] = await db.execute("SELECT * FROM perfis WHERE codigo = ? LIMIT 1", [codigo]);
  return rows[0] || null;
}

async function loadUserProfileContext(userId) {
  const [rows] = await db.execute(
    `SELECT u.id, u.ativo, u.departamento, u.id_company, u.id_perfil, u.is_ad_user,
            p.codigo, p.nome AS perfil_nome, p.is_super_admin, p.requires_company,
            ct.description AS company_type
     FROM usuarios u
     LEFT JOIN perfis p ON p.id = u.id_perfil
     LEFT JOIN company c ON c.id_company = u.id_company
     LEFT JOIN company_type ct ON ct.id_company_type = c.id_company_type
     WHERE u.id = ? LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;

  let permissions = [];
  if (row.id_perfil) {
    permissions = await loadPermissionsForProfile(row.id_perfil);
  }
  const [teamPermissions] = await db.execute(
    `SELECT DISTINCT pp.modulo, pp.acao
     FROM setor_usuarios su
     INNER JOIN setores s ON s.id = su.id_setor AND s.ativo = 1
     INNER JOIN perfil_setores ps ON ps.id_setor = su.id_setor
     INNER JOIN perfil_permissoes pp ON pp.id_perfil = ps.id_perfil
     WHERE su.id_usuario = ? AND su.ativo = 1`,
    [userId],
  );
  const permissionKeys = new Set(permissions.map((perm) => permissionKey(perm.modulo, perm.acao)));
  for (const perm of teamPermissions) {
    permissionKeys.add(permissionKey(perm.modulo, perm.acao));
  }

  return {
    id: row.id,
    ativo: row.ativo,
    departamento: row.departamento,
    id_company: row.id_company != null ? row.id_company : null,
    company_type: row.company_type || null,
    id_perfil: row.id_perfil,
    codigo: row.codigo || "USER",
    perfil_nome: row.perfil_nome || "Usuário",
    is_super_admin: !!row.is_super_admin,
    requires_company: !!row.requires_company,
    is_ad_user: !!row.is_ad_user,
    permissions: Array.from(permissionKeys),
  };
}

async function lookupAssignees({ tipo, q }) {
  const term = String(q || "").trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;

  if (tipo === "usuario") {
    const [rows] = await db.execute(
      `SELECT u.id, u.public_id, u.nome_completo, u.email, u.departamento, u.id_perfil,
              p.nome AS perfil_nome
       FROM usuarios u
       LEFT JOIN perfis p ON p.id = u.id_perfil
       WHERE u.ativo = 1
         AND (u.nome_completo LIKE ? OR u.email LIKE ? OR u.username LIKE ?)
       ORDER BY u.nome_completo ASC
       LIMIT 20`,
      [like, like, like],
    );
    return rows.map((row) => ({
      id: row.id,
      public_id: row.public_id,
      nome_completo: row.nome_completo,
      email: row.email,
      departamento: row.departamento || null,
      id_perfil: row.id_perfil,
      perfil_nome: row.perfil_nome || null,
    }));
  }

  if (tipo === "time") {
    const [rows] = await db.execute(
      `SELECT s.id, s.public_id, s.nome,
              (SELECT COUNT(*) FROM setor_usuarios su
                WHERE su.id_setor = s.id AND su.ativo = 1) AS membros_ativos
       FROM setores s
       WHERE s.ativo = 1 AND s.nome LIKE ?
       ORDER BY s.nome ASC
       LIMIT 20`,
      [like],
    );
    return rows.map((row) => ({
      id: row.id,
      public_id: row.public_id,
      nome: row.nome,
      membros_ativos: Number(row.membros_ativos) || 0,
    }));
  }

  throw new AppError("Informe o tipo usuario ou time.", 400);
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
  lookupAssignees,
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
