const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { maskDocument, mapDocumentType, mapRole } = require("../../utils/privacy");
const collaboratorService = require("../collaborators/collaborator.service");
const policy = require("./blocklist.policy");

function parseListQuery(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function mapBlockRow(row, info) {
  return {
    id_collaborator: Number(row.id_collaborator),
    name: row.name,
    document: row.document,
    document_type: mapDocumentType(row),
    role: mapRole(row),
    status: !!row.status,
    reason: info.reason || row.reason,
    block_type: info.block_type,
    block_value: info.block_value,
    blocked_until: info.blocked_until,
    remaining_days: info.remaining_days,
    remaining_events: info.remaining_events,
    events_elapsed: info.events_elapsed,
    criado_em: row.block_criado_em || row.criado_em,
    id_usuario: row.block_id_usuario != null ? Number(row.block_id_usuario) : null,
    blocked_by_name: row.blocked_by_name || null,
  };
}

async function listBlocks({ page, limit, offset, q, block_type }) {
  await policy.expireDueBlocks();

  const conditions = [policy.activeBlockJoinSql("bl")];
  const params = [];

  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    conditions.push("(c.name LIKE ? OR c.document LIKE ?)");
    params.push(term, term);
  }
  if (block_type && policy.BLOCK_TYPES.includes(block_type)) {
    conditions.push("bl.block_type = ?");
    params.push(block_type);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const fromSql = `
    FROM collaborator_block_list bl
    INNER JOIN collaborator c ON c.id_collaborator = bl.id_collaborator
    INNER JOIN collaborator_document_type cdt
      ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
    INNER JOIN collaborator_role cr ON cr.id_collaborator_role = c.id_collaborator_role
    LEFT JOIN usuarios u ON u.id = bl.id_usuario
  `;

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) AS total ${fromSql} ${where}`,
    params,
  );

  const [rows] = await db.execute(
    `SELECT c.id_collaborator, c.name, c.document, c.status,
            c.id_collaborator_document_type, c.id_collaborator_role,
            cdt.description AS document_type_description,
            cr.description AS role_description,
            bl.reason, bl.block_type, bl.block_value, bl.blocked_until,
            bl.criado_em AS block_criado_em, bl.id_usuario AS block_id_usuario,
            u.nome_completo AS blocked_by_name
     ${fromSql} ${where}
     ORDER BY bl.criado_em DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const ids = rows.map((r) => Number(r.id_collaborator));
  const infoMap = await policy.batchActiveBlockInfo(ids);

  const items = rows
    .map((row) => {
      const info = infoMap.get(Number(row.id_collaborator));
      if (!info) return null;
      return mapBlockRow(row, info);
    })
    .filter(Boolean);

  return {
    items,
    pagination: {
      page,
      limit,
      total: Number(total) || 0,
      totalPages: Math.ceil((Number(total) || 0) / limit) || 1,
    },
  };
}

async function getBlock(idCollaborator) {
  const info = await policy.getActiveBlock(idCollaborator);
  if (!info) throw new AppError("Colaborador não está na lista de restrição.", 404);

  const [rows] = await db.execute(
    `SELECT c.id_collaborator, c.name, c.document, c.status,
            c.id_collaborator_document_type, c.id_collaborator_role,
            cdt.description AS document_type_description,
            cr.description AS role_description,
            bl.reason, bl.block_type, bl.block_value, bl.blocked_until,
            bl.criado_em AS block_criado_em, bl.id_usuario AS block_id_usuario,
            u.nome_completo AS blocked_by_name
     FROM collaborator_block_list bl
     INNER JOIN collaborator c ON c.id_collaborator = bl.id_collaborator
     INNER JOIN collaborator_document_type cdt
       ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
     INNER JOIN collaborator_role cr ON cr.id_collaborator_role = c.id_collaborator_role
     LEFT JOIN usuarios u ON u.id = bl.id_usuario
     WHERE bl.id_collaborator = ?
     LIMIT 1`,
    [idCollaborator],
  );
  if (!rows.length) throw new AppError("Colaborador não está na lista de restrição.", 404);
  return mapBlockRow(rows[0], info);
}

async function searchCollaborators({ q, limit = 12 }) {
  const term = String(q || "").trim();
  if (term.length < 2) return { results: [] };

  const like = `%${term}%`;
  const conditions = ["c.name LIKE ?", "c.document LIKE ?"];
  const params = [like, like];
  const digits = term.replace(/\D/g, "");
  if (digits.length >= 3) {
    conditions.push(
      "REPLACE(REPLACE(REPLACE(REPLACE(c.document, '.', ''), '-', ''), '/', ''), ' ', '') LIKE ?",
    );
    params.push(`%${digits}%`);
  }

  const max = Math.min(20, Math.max(1, Number(limit) || 12));
  const [rows] = await db.execute(
    `SELECT c.id_collaborator, c.name, c.document, c.status,
            c.id_collaborator_document_type, c.id_collaborator_role,
            cdt.description AS document_type_description,
            cr.description AS role_description
     FROM collaborator c
     INNER JOIN collaborator_document_type cdt
       ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
     INNER JOIN collaborator_role cr ON cr.id_collaborator_role = c.id_collaborator_role
     WHERE (${conditions.join(" OR ")})
     ORDER BY c.name ASC
     LIMIT ${max}`,
    params,
  );

  const infoMap = await policy.batchActiveBlockInfo(rows.map((r) => r.id_collaborator));
  return {
    results: rows.map((row) => {
      const info = infoMap.get(Number(row.id_collaborator));
      return {
        id_collaborator: Number(row.id_collaborator),
        name: row.name,
        document: maskDocument(row.document, row.document_type_description),
        status: !!row.status,
        document_type: mapDocumentType(row),
        role: mapRole(row),
        is_blocklisted: !!info,
        block_type: info?.block_type || null,
      };
    }),
  };
}

async function addBlock(payload, userId) {
  const existing = await collaboratorService.findCollaboratorById(payload.id_collaborator);
  if (!existing) throw new AppError("Colaborador não encontrado.", 404);

  const already = await policy.getActiveBlock(payload.id_collaborator);
  if (already) {
    throw new AppError("Colaborador já está na lista de restrição.", 409);
  }

  const period = policy.normalizePeriod(payload);
  const collaboratorId = Number(payload.id_collaborator);
  const reason = String(payload.reason).trim();

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO collaborator_block_list
         (id_collaborator, reason, block_type, block_value, blocked_until, id_usuario)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         reason = VALUES(reason),
         block_type = VALUES(block_type),
         block_value = VALUES(block_value),
         blocked_until = VALUES(blocked_until),
         id_usuario = VALUES(id_usuario),
         criado_em = CURRENT_TIMESTAMP`,
      [
        collaboratorId,
        reason,
        period.block_type,
        period.block_value,
        period.blocked_until,
        userId || null,
      ],
    );
    await collaboratorService.revokeAccessesOnBlocklist(conn, collaboratorId, reason);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const facialCommand = require("../facial/facial.command.service");
  await facialCommand.sendRevokeSafe(collaboratorId, "blocklist");

  return getBlock(collaboratorId);
}

async function updateBlock(idCollaborator, payload) {
  const current = await policy.getActiveBlock(idCollaborator);
  if (!current) throw new AppError("Colaborador não está na lista de restrição.", 404);

  const nextType = payload.block_type || current.block_type;
  const nextValue =
    payload.block_value !== undefined ? payload.block_value : current.block_value;
  const period = policy.normalizePeriod({
    block_type: nextType,
    block_value: nextValue,
  });
  const reason =
    payload.reason !== undefined ? String(payload.reason).trim() : current.reason;

  if (payload.reason !== undefined && reason.length < 10) {
    throw new AppError("Informe um motivo com pelo menos 10 caracteres.", 400);
  }

  await db.execute(
    `UPDATE collaborator_block_list
        SET reason = ?,
            block_type = ?,
            block_value = ?,
            blocked_until = ?
      WHERE id_collaborator = ?`,
    [reason, period.block_type, period.block_value, period.blocked_until, idCollaborator],
  );

  return getBlock(idCollaborator);
}

async function removeBlock(idCollaborator) {
  const existing = await collaboratorService.findCollaboratorById(idCollaborator);
  if (!existing) throw new AppError("Colaborador não encontrado.", 404);

  const [result] = await db.execute(
    "DELETE FROM collaborator_block_list WHERE id_collaborator = ?",
    [idCollaborator],
  );
  if (result.affectedRows === 0) {
    throw new AppError("Colaborador não está na lista de restrição.", 404);
  }
  return { success: true, id_collaborator: Number(idCollaborator) };
}

module.exports = {
  parseListQuery,
  listBlocks,
  getBlock,
  searchCollaborators,
  addBlock,
  updateBlock,
  removeBlock,
};
