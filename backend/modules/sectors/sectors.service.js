const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { formatUuid } = require("../../utils/publicId");
const { isSuperAdmin } = require("../../utils/permissions");

const PAPEIS_CAN_APPROVE = ["APROVADOR", "GESTOR"];
const PAPEL_GESTOR = "GESTOR";
const MEMBER_FLOW_TYPES = [
  "ACESSO_SERVICO",
  "CREDENCIAMENTO_EVENTO",
  "CREDENCIAMENTO_EVENTO_INTERNO",
];

function parseListQuery(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function isAdminUser(user) {
  return isSuperAdmin(user);
}

function mapSectorRow(row, contacts = null) {
  const sector = {
    id: row.id,
    public_id: formatUuid(row.public_id),
    nome: row.nome,
    descricao: row.descricao,
    ativo: !!row.ativo,
    membrosAtivos: Number(row.membros_ativos || 0),
    fluxosConfigurados: Number(row.fluxos_configurados || 0),
    contatosCadastrados: Number(row.contatos_cadastrados || 0),
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
  if (contacts !== null) {
    sector.contacts = contacts;
  }
  return sector;
}

function mapContactRow(row) {
  return {
    id: row.id,
    public_id: formatUuid(row.public_id),
    idSetor: row.id_setor,
    nome: row.nome,
    telefone: row.telefone || null,
    ramal: row.ramal || null,
    email: row.email || null,
  };
}

function mapMemberRow(row, fluxos = []) {
  return {
    public_id: formatUuid(row.public_id),
    usuario_public_id: formatUuid(row.usuario_public_id),
    nome: row.nome_completo,
    email: row.email,
    papel: row.papel,
    ativo: !!row.ativo,
    fluxos,
  };
}

function mapFlowRow(row) {
  return {
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
           (SELECT COUNT(*) FROM setor_fluxos sf WHERE sf.id_setor = s.id AND sf.ativo = 1) AS fluxos_configurados,
           (SELECT COUNT(*) FROM setor_contatos sc WHERE sc.id_setor = s.id) AS contatos_cadastrados
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

  const sectors = rows.map((row) => mapSectorRow(row));
  return {
    sectors,
    data: sectors,
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

async function findContactsBySectorId(idSetor, conn = db) {
  const [rows] = await conn.execute(
    `SELECT * FROM setor_contatos WHERE id_setor = ? ORDER BY nome ASC`,
    [idSetor],
  );
  return rows.map(mapContactRow);
}

async function insertContacts(conn, sectorId, contacts) {
  if (!contacts || contacts.length === 0) return;
  for (const contact of contacts) {
    await conn.execute(
      `INSERT INTO setor_contatos (id_setor, nome, telefone, ramal, email)
       VALUES (?, ?, ?, ?, ?)`,
      [
        sectorId,
        contact.nome.trim(),
        contact.telefone?.trim() || null,
        contact.ramal?.trim() || null,
        contact.email?.trim() || null,
      ],
    );
  }
}

async function createSector(data, userId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO setores (nome, descricao, criado_por) VALUES (?, ?, ?)`,
      [data.nome.trim(), data.descricao?.trim() || null, userId || null],
    );
    await insertContacts(conn, result.insertId, data.contacts);
    await conn.commit();
    return getSectorById(result.insertId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateSector(id, data) {
  const existing = await findSectorById(id);
  if (!existing) throw new AppError("Setor não encontrado.", 404);

  const nome = data.nome != null ? data.nome.trim() : existing.nome;
  const descricao =
    data.descricao !== undefined ? data.descricao?.trim() || null : existing.descricao;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`UPDATE setores SET nome = ?, descricao = ? WHERE id = ?`, [
      nome,
      descricao,
      id,
    ]);
    if (data.contacts !== undefined) {
      await conn.execute(`DELETE FROM setor_contatos WHERE id_setor = ?`, [id]);
      await insertContacts(conn, id, data.contacts);
    }
    await conn.commit();
    return getSectorById(id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
            (SELECT COUNT(*) FROM setor_fluxos sf WHERE sf.id_setor = s.id AND sf.ativo = 1) AS fluxos_configurados,
            (SELECT COUNT(*) FROM setor_contatos sc WHERE sc.id_setor = s.id) AS contatos_cadastrados
       FROM setores s
      WHERE s.id = ?
      LIMIT 1`,
    [id],
  );
  if (!rows.length) throw new AppError("Setor não encontrado.", 404);
  const contacts = await findContactsBySectorId(id);
  return mapSectorRow(rows[0], contacts);
}

async function listContacts(idSetor) {
  const sector = await findSectorById(idSetor);
  if (!sector) throw new AppError("Setor não encontrado.", 404);
  return findContactsBySectorId(idSetor);
}

async function addContact(idSetor, data) {
  const sector = await findSectorById(idSetor);
  if (!sector) throw new AppError("Setor não encontrado.", 404);

  await db.execute(
    `INSERT INTO setor_contatos (id_setor, nome, telefone, ramal, email)
     VALUES (?, ?, ?, ?, ?)`,
    [
      idSetor,
      data.nome.trim(),
      data.telefone?.trim() || null,
      data.ramal?.trim() || null,
      data.email?.trim() || null,
    ],
  );
  return listContacts(idSetor);
}

async function updateContact(idSetor, contactId, data) {
  const [rows] = await db.execute(
    `SELECT * FROM setor_contatos WHERE id = ? AND id_setor = ? LIMIT 1`,
    [contactId, idSetor],
  );
  if (!rows.length) throw new AppError("Contato não encontrado.", 404);

  await db.execute(
    `UPDATE setor_contatos SET nome = ?, telefone = ?, ramal = ?, email = ? WHERE id = ?`,
    [
      data.nome.trim(),
      data.telefone?.trim() || null,
      data.ramal?.trim() || null,
      data.email?.trim() || null,
      contactId,
    ],
  );
  return listContacts(idSetor);
}

async function removeContact(idSetor, contactId) {
  const [rows] = await db.execute(
    `SELECT id FROM setor_contatos WHERE id = ? AND id_setor = ? LIMIT 1`,
    [contactId, idSetor],
  );
  if (!rows.length) throw new AppError("Contato não encontrado.", 404);

  await db.execute(`DELETE FROM setor_contatos WHERE id = ?`, [contactId]);
  return listContacts(idSetor);
}

async function listMembers(idSetor) {
  const sector = await findSectorById(idSetor);
  if (!sector) throw new AppError("Setor não encontrado.", 404);

  const [rows] = await db.execute(
    `SELECT su.*, u.nome_completo, u.email, u.public_id AS usuario_public_id
       FROM setor_usuarios su
       JOIN usuarios u ON u.id = su.id_usuario
      WHERE su.id_setor = ? AND su.ativo = 1
      ORDER BY u.nome_completo ASC`,
    [idSetor],
  );
  const fluxosByMember = await loadMemberFlows(rows.map((row) => row.id));
  return rows.map((row) => mapMemberRow(row, fluxosByMember.get(Number(row.id)) || []));
}

async function loadMemberFlows(memberIds) {
  const map = new Map();
  if (!memberIds.length) return map;
  const [rows] = await db.execute(
    `SELECT id_setor_usuario, tipo_entidade
       FROM setor_usuario_fluxos
      WHERE ativo = 1 AND id_setor_usuario IN (${memberIds.map(() => "?").join(",")})`,
    memberIds,
  );
  for (const row of rows) {
    const key = Number(row.id_setor_usuario);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row.tipo_entidade);
  }
  return map;
}

async function replaceMemberFlows(idSetorUsuario, fluxos) {
  const selected = new Set(fluxos || []);
  for (const tipo of MEMBER_FLOW_TYPES) {
    await db.execute(
      `INSERT INTO setor_usuario_fluxos (id_setor_usuario, tipo_entidade, ativo)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE ativo = VALUES(ativo)`,
      [idSetorUsuario, tipo, selected.has(tipo) ? 1 : 0],
    );
  }
}

async function addMember(idSetor, { id_usuario, papel, fluxos }) {
  const sector = await findSectorById(idSetor);
  if (!sector) throw new AppError("Setor não encontrado.", 404);

  const [userRows] = await db.execute(
    `SELECT id FROM usuarios WHERE id = ? AND ativo = 1 LIMIT 1`,
    [id_usuario],
  );
  if (!userRows.length) throw new AppError("Usuário não encontrado ou inativo.", 404);

  const [existing] = await db.execute(
    `SELECT id, ativo FROM setor_usuarios WHERE id_setor = ? AND id_usuario = ? LIMIT 1`,
    [idSetor, id_usuario],
  );

  let linkId;
  if (existing.length) {
    linkId = existing[0].id;
    await db.execute(
      `UPDATE setor_usuarios SET papel = ?, ativo = 1 WHERE id = ?`,
      [papel, linkId],
    );
  } else {
    const [inserted] = await db.execute(
      `INSERT INTO setor_usuarios (id_setor, id_usuario, papel, ativo)
       VALUES (?, ?, ?, 1)`,
      [idSetor, id_usuario, papel],
    );
    linkId = inserted.insertId;
  }

  if (fluxos) await replaceMemberFlows(linkId, fluxos);

  return listMembers(idSetor);
}

async function patchMemberFlow(idSetor, linkId, { tipoEntidade, ativo }) {
  const [rows] = await db.execute(
    `SELECT id FROM setor_usuarios WHERE id = ? AND id_setor = ? LIMIT 1`,
    [linkId, idSetor],
  );
  if (!rows.length) throw new AppError("Vínculo não encontrado.", 404);
  if (!MEMBER_FLOW_TYPES.includes(tipoEntidade)) {
    throw new AppError("Fluxo inválido para o participante.", 400);
  }

  await db.execute(
    `INSERT INTO setor_usuario_fluxos (id_setor_usuario, tipo_entidade, ativo)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE ativo = VALUES(ativo)`,
    [linkId, tipoEntidade, ativo ? 1 : 0],
  );
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
  listContacts,
  addContact,
  updateContact,
  removeContact,
  listMembers,
  addMember,
  patchMemberFlow,
  updateMember,
  removeMember,
  getFlows,
  upsertFlows,
};
