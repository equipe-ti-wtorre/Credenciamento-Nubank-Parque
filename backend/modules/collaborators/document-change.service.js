const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { validateDocumentByType } = require("./collaborator.schema");

function getUserRole(req) {
  return String(req.user?.role || req.user?.perfil || "USER").toUpperCase();
}

async function hasCollaboratorHistory(idCollaborator) {
  const [cred] = await db.execute(
    `SELECT 1 FROM event_day_company_collaborator WHERE id_collaborator = ? LIMIT 1`,
    [idCollaborator],
  );
  if (cred.length > 0) return true;
  const [bl] = await db.execute(
    `SELECT 1 FROM collaborator_black_list WHERE id_collaborator = ? LIMIT 1`,
    [idCollaborator],
  );
  return bl.length > 0;
}

async function findCollaboratorRow(id) {
  const [rows] = await db.execute(
    `SELECT c.*, cdt.description AS document_type_description
     FROM collaborator c
     INNER JOIN collaborator_document_type cdt
       ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
     WHERE c.id_collaborator = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function createDocumentChangeRequest(req, idCollaborator, { new_document, reason }) {
  const role = getUserRole(req);
  if (!["ADMIN", "PRODUTORA", "PADRAO"].includes(role)) {
    throw new AppError("Perfil sem permissão para solicitar alteração de documento.", 403);
  }

  const row = await findCollaboratorRow(idCollaborator);
  if (!row) throw new AppError("Colaborador não encontrado.", 404);

  const hasHistory = await hasCollaboratorHistory(idCollaborator);
  if (!hasHistory && role !== "ADMIN") {
    throw new AppError(
      "Colaborador sem histórico de credenciamento. Solicite ao administrador a correção direta.",
      400,
    );
  }

  const [pending] = await db.execute(
    `SELECT id FROM document_change_request
     WHERE id_collaborator = ? AND status = 'PENDING' LIMIT 1`,
    [idCollaborator],
  );
  if (pending.length > 0) {
    throw new AppError("Já existe uma solicitação pendente para este colaborador.", 409);
  }

  const docResult = await validateDocumentByType(
    new_document,
    row.id_collaborator_document_type,
  );
  if (docResult.error) throw new AppError(docResult.error, 400);

  if (docResult.value === row.document) {
    throw new AppError("O novo documento é igual ao atual.", 400);
  }

  const [result] = await db.execute(
    `INSERT INTO document_change_request (
       id_collaborator, id_collaborator_document_type,
       old_document, new_document, reason, id_usuario_requester
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      idCollaborator,
      row.id_collaborator_document_type,
      row.document,
      docResult.value,
      reason,
      req.user?.id || null,
    ],
  );

  return getDocumentChangeById(result.insertId);
}

async function getDocumentChangeById(id) {
  const [rows] = await db.execute(
    `SELECT dcr.*, c.name AS collaborator_name
     FROM document_change_request dcr
     INNER JOIN collaborator c ON c.id_collaborator = dcr.id_collaborator
     WHERE dcr.id = ? LIMIT 1`,
    [id],
  );
  if (!rows[0]) throw new AppError("Solicitação não encontrada.", 404);
  return mapRequest(rows[0]);
}

function mapRequest(row) {
  return {
    id: row.id,
    id_collaborator: row.id_collaborator,
    collaborator_name: row.collaborator_name,
    id_collaborator_document_type: row.id_collaborator_document_type,
    old_document: row.old_document,
    new_document: row.new_document,
    status: row.status,
    reason: row.reason,
    admin_reason: row.admin_reason,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

async function listPendingDocumentChanges() {
  const [rows] = await db.execute(
    `SELECT dcr.*, c.name AS collaborator_name
     FROM document_change_request dcr
     INNER JOIN collaborator c ON c.id_collaborator = dcr.id_collaborator
     WHERE dcr.status = 'PENDING'
     ORDER BY dcr.criado_em ASC`,
  );
  return rows.map(mapRequest);
}

async function updateDocumentChangeStatus(req, id, { status, admin_reason }) {
  if (getUserRole(req) !== "ADMIN") {
    throw new AppError("Apenas administrador pode aprovar ou rejeitar solicitações.", 403);
  }

  const request = await getDocumentChangeById(id);
  if (request.status !== "PENDING") {
    throw new AppError("Solicitação já foi processada.", 400);
  }

  if (!["APPROVED", "REJECTED"].includes(status)) {
    throw new AppError("Status inválido.", 400);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE document_change_request
       SET status = ?, admin_reason = ?, id_usuario_reviewer = ?
       WHERE id = ?`,
      [status, admin_reason || null, req.user?.id || null, id],
    );

    if (status === "APPROVED") {
      await conn.execute(
        `UPDATE collaborator SET document = ? WHERE id_collaborator = ?`,
        [request.new_document, request.id_collaborator],
      );
    }

    await conn.commit();
    return getDocumentChangeById(id);
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      throw new AppError("Novo documento já está em uso por outro colaborador.", 409);
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  createDocumentChangeRequest,
  listPendingDocumentChanges,
  updateDocumentChangeStatus,
  getDocumentChangeById,
};
