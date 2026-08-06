const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { isSuperAdmin } = require("../../utils/permissions");

const PAPEIS_CAN_APPROVE = ["APROVADOR", "GESTOR"];
const PAPEL_GESTOR = "GESTOR";

function parseListQuery(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function isAdminUser(user) {
  return isSuperAdmin(user);
}

function mapSectorRow(row) {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    ativo: !!row.ativo,
    membrosAtivos: Number(row.membros_ativos || 0),
    fluxosConfigurados: Number(row.fluxos_configurados || 0),
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

function mapMemberRow(row) {
  return {
    linkId: row.id,
    idUsuario: row.id_usuario,
    nome: row.nome_completo,
    email: row.email,
    papel: row.papel,
    ativo: !!row.ativo,
  };
}

function mapFlowRow(row) {
  return {
    id: row.id,
    tipoEntidade: row.tipo_entidade,
    niveisExigidos: 1,
    ativo: !!row.ativo,
  };
}

async function getUserPapel(idSetor, userId) {
  const [rows] = await db.execute(
    `SELECT su.papel
       FROM setor_usuarios su
       JOIN usuarios u ON u.id = su.id_usuario
      WHERE su.id_setor = ? AND su.id_usuario = ?
        AND su.ativo = 1 AND u.ativo = 1
      LIMIT 1`,
    [idSetor, userId],
  );
  return rows[0]?.papel || null;
}

async function assertIsMember(idSetor, userId) {
  const papel = await getUserPapel(idSetor, userId);
  if (!papel) {
    throw new AppError("Usuário não é membro ativo deste setor.", 403);
  }
  return papel;
}

async function assertIsGestor(idSetor, userOrId) {
  const userId = typeof userOrId === "object" ? userOrId?.id : userOrId;
  if (typeof userOrId === "object" && isAdminUser(userOrId)) return PAPEL_GESTOR;

  const papel = await getUserPapel(idSetor, userId);
  if (papel !== PAPEL_GESTOR) {
    throw new AppError("Apenas gestores do setor ou administradores podem realizar esta ação.", 403);
  }
  return papel;
}

async function listSectorMemberships(userId) {
  const [rows] = await db.execute(
    `SELECT s.id AS sector_id, s.nome AS sector_nome, su.papel
       FROM setor_usuarios su
       JOIN setores s ON s.id = su.id_setor
       JOIN usuarios u ON u.id = su.id_usuario
      WHERE su.id_usuario = ? AND su.ativo = 1 AND s.ativo = 1 AND u.ativo = 1
      ORDER BY s.nome ASC`,
    [userId],
  );
  return rows.map((r) => ({
    sectorId: r.sector_id,
    sectorNome: r.sector_nome,
    papel: r.papel,
  }));
}

async function listSectorsSelect() {
  const [rows] = await db.execute(
    `SELECT id, nome FROM setores WHERE ativo = 1 ORDER BY nome ASC`,
  );
  return rows.map((r) => ({ id: r.id, nome: r.nome }));
}

async function listSectors({ page, limit, offset, user }) {
  const isAdmin = isAdminUser(user);
  let countSql = `SELECT COUNT(*) AS total FROM setores s`;
  let listSql = `
    SELECT s.*,
           (SELECT COUNT(*) FROM setor_usuarios su WHERE su.id_setor = s.id AND su.ativo = 1) AS membros_ativos,
           (SELECT COUNT(*) FROM setor_fluxos sf WHERE sf.id_setor = s.id AND sf.ativo = 1) AS fluxos_configurados
      FROM setores s`;
  const params = [];

  if (!isAdmin) {
    countSql += `
      JOIN setor_usuarios su ON su.id_setor = s.id AND su.id_usuario = ? AND su.ativo = 1 AND su.papel = ?
    `;
    listSql += `
      JOIN setor_usuarios su ON su.id_setor = s.id AND su.id_usuario = ? AND su.ativo = 1 AND su.papel = ?
    `;
    params.push(user.id, PAPEL_GESTOR);
  }

  listSql += ` ORDER BY s.nome ASC LIMIT ? OFFSET ?`;

  const [countRows] = await db.execute(countSql, params);
  const [rows] = await db.execute(listSql, [...params, limit, offset]);

  return {
    data: rows.map(mapSectorRow),
    pagination: {
      page,
      limit,
      total: countRows[0].total,
    },
  };
}

async function findSectorById(id) {
  const [rows] = await db.execute(`SELECT * FROM setores WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function createSector(data, userId) {
  const [result] = await db.execute(
    `INSERT INTO setores (nome, descricao, criado_por) VALUES (?, ?, ?)`,
    [data.nome.trim(), data.descricao?.trim() || null, userId || null],
  );
  const sector = await findSectorById(result.insertId);
  return mapSectorRow({ ...sector, membros_ativos: 0, fluxos_configurados: 0 });
}

async function updateSector(id, data) {
  const existing = await findSectorById(id);
  if (!existing) throw new AppError("Setor não encontrado.", 404);

  const nome = data.nome != null ? data.nome.trim() : existing.nome;
  const descricao =
    data.descricao !== undefined ? data.descricao?.trim() || null : existing.descricao;

  await db.execute(`UPDATE setores SET nome = ?, descricao = ? WHERE id = ?`, [
    nome,
    descricao,
    id,
  ]);
  return getSectorById(id);
}

async function assertNoPendingApprovals(idSetor) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS total FROM aprovacoes WHERE id_setor = ? AND status = 'PENDENTE'`,
    [idSetor],
  );
  if (rows[0].total > 0) {
    throw new AppError(
      "Não é possível desativar o setor enquanto houver aprovações pendentes.",
      409,
    );
  }
}

async function patchSectorStatus(id, ativo) {
  const existing = await findSectorById(id);
  if (!existing) throw new AppError("Setor não encontrado.", 404);
  if (!ativo) {
    await assertNoPendingApprovals(id);
  }
  await db.execute(`UPDATE setores SET ativo = ? WHERE id = ?`, [ativo ? 1 : 0, id]);
  return getSectorById(id);
}

async function getSectorById(id) {
  const [rows] = await db.execute(
    `SELECT s.*,
            (SELECT COUNT(*) FROM setor_usuarios su WHERE su.id_setor = s.id AND su.ativo = 1) AS membros_ativos,
            (SELECT COUNT(*) FROM setor_fluxos sf WHERE sf.id_setor = s.id AND sf.ativo = 1) AS fluxos_configurados
       FROM setores s
      WHERE s.id = ?
      LIMIT 1`,
    [id],
  );
  if (!rows.length) throw new AppError("Setor não encontrado.", 404);
  return mapSectorRow(rows[0]);
}

async function listMembers(idSetor) {
  const sector = await findSectorById(idSetor);
  if (!sector) throw new AppError("Setor não encontrado.", 404);

  const [rows] = await db.execute(
    `SELECT su.*, u.nome_completo, u.email
       FROM setor_usuarios su
       JOIN usuarios u ON u.id = su.id_usuario
      WHERE su.id_setor = ? AND su.ativo = 1
      ORDER BY u.nome_completo ASC`,
    [idSetor],
  );
  return rows.map(mapMemberRow);
}

async function addMember(idSetor, { idUsuario, papel }) {
  const sector = await findSectorById(idSetor);
  if (!sector) throw new AppError("Setor não encontrado.", 404);

  const [userRows] = await db.execute(
    `SELECT id FROM usuarios WHERE id = ? AND ativo = 1 LIMIT 1`,
    [idUsuario],
  );
  if (!userRows.length) throw new AppError("Usuário não encontrado ou inativo.", 404);

  const [existing] = await db.execute(
    `SELECT id, ativo FROM setor_usuarios WHERE id_setor = ? AND id_usuario = ? LIMIT 1`,
    [idSetor, idUsuario],
  );

  if (existing.length) {
    await db.execute(
      `UPDATE setor_usuarios SET papel = ?, ativo = 1 WHERE id = ?`,
      [papel, existing[0].id],
    );
  } else {
    await db.execute(
      `INSERT INTO setor_usuarios (id_setor, id_usuario, papel, ativo)
       VALUES (?, ?, ?, 1)`,
      [idSetor, idUsuario, papel],
    );
  }

  return listMembers(idSetor);
}

async function updateMember(idSetor, linkId, data) {
  const [rows] = await db.execute(
    `SELECT * FROM setor_usuarios WHERE id = ? AND id_setor = ? LIMIT 1`,
    [linkId, idSetor],
  );
  if (!rows.length) throw new AppError("Vínculo não encontrado.", 404);

  const papel = data.papel != null ? data.papel : rows[0].papel;
  const ativo = data.ativo != null ? (data.ativo ? 1 : 0) : rows[0].ativo;

  await db.execute(`UPDATE setor_usuarios SET papel = ?, ativo = ? WHERE id = ?`, [
    papel,
    ativo,
    linkId,
  ]);
  return listMembers(idSetor);
}

async function removeMember(idSetor, linkId) {
  const [rows] = await db.execute(
    `SELECT id FROM setor_usuarios WHERE id = ? AND id_setor = ? LIMIT 1`,
    [linkId, idSetor],
  );
  if (!rows.length) throw new AppError("Vínculo não encontrado.", 404);

  await db.execute(`UPDATE setor_usuarios SET ativo = 0 WHERE id = ?`, [linkId]);
  return listMembers(idSetor);
}

async function getFlows(idSetor) {
  const sector = await findSectorById(idSetor);
  if (!sector) throw new AppError("Setor não encontrado.", 404);

  const [rows] = await db.execute(
    `SELECT * FROM setor_fluxos WHERE id_setor = ? ORDER BY tipo_entidade ASC`,
    [idSetor],
  );
  return rows.map(mapFlowRow);
}

async function upsertFlows(idSetor, flows) {
  const sector = await findSectorById(idSetor);
  if (!sector) throw new AppError("Setor não encontrado.", 404);

  for (const flow of flows) {
    await db.execute(
      `INSERT INTO setor_fluxos (id_setor, tipo_entidade, niveis_exigidos, ativo)
       VALUES (?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         niveis_exigidos = 1,
         ativo = VALUES(ativo)`,
      [idSetor, flow.tipoEntidade, flow.ativo ? 1 : 0],
    );
  }
  return getFlows(idSetor);
}

module.exports = {
  PAPEIS_CAN_APPROVE,
  PAPEL_GESTOR,
  parseListQuery,
  isAdminUser,
  getUserPapel,
  assertIsMember,
  assertIsGestor,
  listSectorMemberships,
  listSectorsSelect,
  listSectors,
  getSectorById,
  createSector,
  updateSector,
  patchSectorStatus,
  listMembers,
  addMember,
  updateMember,
  removeMember,
  getFlows,
  upsertFlows,
};
