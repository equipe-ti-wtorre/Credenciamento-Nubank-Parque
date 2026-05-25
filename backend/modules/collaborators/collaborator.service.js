const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const {
  maskDocument,
  mapDocumentType,
  mapRole,
  toMaskedCollaborator,
} = require("../../utils/privacy");
const { validateDocumentByType } = require("./collaborator.schema");

const COLLABORATOR_SELECT = `
  SELECT c.*,
         cdt.description AS document_type_description,
         cr.description AS role_description
  FROM collaborator c
  INNER JOIN collaborator_document_type cdt
    ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
  INNER JOIN collaborator_role cr ON cr.id_collaborator_role = c.id_collaborator_role
`;

function getUserRole(req) {
  return String(req.user?.role || req.user?.perfil || "USER").toUpperCase();
}

function isAdmin(req) {
  return getUserRole(req) === "ADMIN";
}

function assertAdminForList(req) {
  if (!isAdmin(req)) {
    throw new AppError(
      "Listagem de colaboradores restrita. Use a busca por documento.",
      403,
    );
  }
}

function assertCanWriteCollaborator(req) {
  const role = getUserRole(req);
  if (role === "ADMIN" || role === "PRODUTORA" || role === "PADRAO") {
    return;
  }
  throw new AppError("Perfil sem permissão para cadastrar colaboradores.", 403);
}

function assertCanSearchCollaborator(req) {
  const role = getUserRole(req);
  if (role === "ADMIN" || role === "CONTROLADOR") {
    return;
  }
  assertCanWriteCollaborator(req);
}

function assertAdminForUpdate(req) {
  if (!isAdmin(req)) {
    throw new AppError(
      "Edição de colaboradores restrita ao administrador nesta versão.",
      403,
    );
  }
}

function mapCollaboratorRow(row, { isBlacklisted = false } = {}) {
  return {
    id_collaborator: row.id_collaborator,
    id_collaborator_document_type: row.id_collaborator_document_type,
    id_collaborator_role: row.id_collaborator_role,
    document: row.document,
    name: row.name,
    rg: row.rg || null,
    phone: row.phone || null,
    status: !!row.status,
    is_blacklisted: !!isBlacklisted,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    document_type: mapDocumentType(row),
    role: mapRole(row),
  };
}

function parseListQuery(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit };
}

function parseListFilters(query) {
  const filters = {};
  if (query.name) filters.name = String(query.name).trim();
  if (query.document) filters.document = String(query.document).trim();
  if (query.status !== undefined && query.status !== "") {
    filters.status = String(query.status).toLowerCase() === "true" || query.status === "1";
  }
  if (query.id_collaborator_role != null && query.id_collaborator_role !== "") {
    filters.id_collaborator_role = parseInt(query.id_collaborator_role, 10);
  }
  if (
    query.id_collaborator_document_type != null &&
    query.id_collaborator_document_type !== ""
  ) {
    filters.id_collaborator_document_type = parseInt(
      query.id_collaborator_document_type,
      10,
    );
  }
  return filters;
}

async function checkBlacklist(idCollaborator) {
  const [rows] = await db.execute(
    "SELECT 1 FROM collaborator_black_list WHERE id_collaborator = ? LIMIT 1",
    [idCollaborator],
  );
  return rows.length > 0;
}

async function listDocumentTypes() {
  const [rows] = await db.execute(
    `SELECT id_collaborator_document_type, description
     FROM collaborator_document_type ORDER BY description ASC`,
  );
  return rows.map((r) => ({
    id_collaborator_document_type: r.id_collaborator_document_type,
    description: r.description,
  }));
}

async function listRoles() {
  const [rows] = await db.execute(
    `SELECT id_collaborator_role, description
     FROM collaborator_role ORDER BY description ASC`,
  );
  return rows.map((r) => ({
    id_collaborator_role: r.id_collaborator_role,
    description: r.description,
  }));
}

async function findDocumentTypeById(id) {
  const [rows] = await db.execute(
    `SELECT id_collaborator_document_type, description
     FROM collaborator_document_type WHERE id_collaborator_document_type = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findRoleById(id) {
  const [rows] = await db.execute(
    `SELECT id_collaborator_role, description
     FROM collaborator_role WHERE id_collaborator_role = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findCollaboratorById(id) {
  const [rows] = await db.execute(
    `${COLLABORATOR_SELECT} WHERE c.id_collaborator = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findCollaboratorByDocument(document, idDocumentType) {
  const [rows] = await db.execute(
    `${COLLABORATOR_SELECT}
     WHERE c.document = ? AND c.id_collaborator_document_type = ? LIMIT 1`,
    [document, idDocumentType],
  );
  return rows[0] || null;
}

async function assertDocumentTypeExists(id) {
  const type = await findDocumentTypeById(id);
  if (!type) throw new AppError("Tipo de documento inválido.", 400);
  return type;
}

async function assertRoleExists(id) {
  const role = await findRoleById(id);
  if (!role) throw new AppError("Função/cargo inválido.", 400);
  return role;
}

async function assertNotDuplicate(document, idDocumentType, excludeId = null) {
  const existing = await findCollaboratorByDocument(document, idDocumentType);
  if (existing && (excludeId == null || existing.id_collaborator !== Number(excludeId))) {
    throw new AppError("Colaborador já cadastrado com este documento.", 409);
  }
}

function buildListWhere(filters) {
  const conditions = [];
  const params = [];

  if (filters.name) {
    conditions.push("c.name LIKE ?");
    params.push(`%${filters.name}%`);
  }
  if (filters.document) {
    conditions.push("c.document LIKE ?");
    params.push(`%${filters.document}%`);
  }
  if (filters.status !== undefined) {
    conditions.push("c.status = ?");
    params.push(filters.status ? 1 : 0);
  }
  if (filters.id_collaborator_role) {
    conditions.push("c.id_collaborator_role = ?");
    params.push(filters.id_collaborator_role);
  }
  if (filters.id_collaborator_document_type) {
    conditions.push("c.id_collaborator_document_type = ?");
    params.push(filters.id_collaborator_document_type);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

async function listCollaborators(req, { page, limit, filters }) {
  assertAdminForList(req);
  const offset = (page - 1) * limit;
  const { where, params } = buildListWhere(filters);

  const [rows] = await db.execute(
    `${COLLABORATOR_SELECT} ${where}
     ORDER BY c.name ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) AS total FROM collaborator c ${where}`,
    params,
  );

  const collaborators = await Promise.all(
    rows.map(async (row) => {
      const isBlacklisted = await checkBlacklist(row.id_collaborator);
      return mapCollaboratorRow(row, { isBlacklisted });
    }),
  );

  return {
    collaborators,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function searchByDocument(req, { document, id_collaborator_document_type }) {
  assertCanSearchCollaborator(req);
  const row = await findCollaboratorByDocument(document, id_collaborator_document_type);
  if (!row) {
    throw new AppError("Colaborador não encontrado.", 404);
  }
  const isBlacklisted = await checkBlacklist(row.id_collaborator);
  return {
    found: true,
    collaborator: toMaskedCollaborator(row, { isBlacklisted }),
  };
}

async function getCollaboratorById(req, id) {
  const row = await findCollaboratorById(id);
  if (!row) throw new AppError("Colaborador não encontrado.", 404);

  const isBlacklisted = await checkBlacklist(row.id_collaborator);

  if (isAdmin(req)) {
    return mapCollaboratorRow(row, { isBlacklisted });
  }

  const role = getUserRole(req);
  if (role === "PRODUTORA" || role === "PADRAO") {
    return toMaskedCollaborator(row, { isBlacklisted });
  }

  throw new AppError("Perfil sem permissão para consultar colaboradores.", 403);
}

async function getCollaboratorDetailById(id) {
  const row = await findCollaboratorById(id);
  if (!row) throw new AppError("Colaborador não encontrado.", 404);
  const isBlacklisted = await checkBlacklist(row.id_collaborator);
  return mapCollaboratorRow(row, { isBlacklisted });
}

async function createCollaborator(req, data) {
  assertCanWriteCollaborator(req);
  await assertDocumentTypeExists(data.id_collaborator_document_type);
  await assertRoleExists(data.id_collaborator_role);
  await assertNotDuplicate(data.document, data.id_collaborator_document_type);

  const [result] = await db.execute(
    `INSERT INTO collaborator (
       id_collaborator_document_type, id_collaborator_role,
       document, name, rg, phone, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id_collaborator_document_type,
      data.id_collaborator_role,
      data.document,
      data.name,
      data.rg || null,
      data.phone || null,
      data.status !== false ? 1 : 0,
    ],
  );

  return getCollaboratorDetailById(result.insertId);
}

async function updateCollaborator(req, id, data) {
  assertAdminForUpdate(req);
  const existing = await findCollaboratorById(id);
  if (!existing) throw new AppError("Colaborador não encontrado.", 404);

  const idDocType = data.id_collaborator_document_type ?? existing.id_collaborator_document_type;
  const idRole = data.id_collaborator_role ?? existing.id_collaborator_role;

  if (data.id_collaborator_document_type != null) {
    await assertDocumentTypeExists(idDocType);
  }
  if (data.id_collaborator_role != null) {
    await assertRoleExists(idRole);
  }

  let document = existing.document;
  if (data.document != null) {
    const docResult = await validateDocumentByType(data.document, idDocType);
    if (docResult.error) throw new AppError(docResult.error, 400);
    document = docResult.value;
    await assertNotDuplicate(document, idDocType, id);
  } else if (data.id_collaborator_document_type != null) {
    await assertNotDuplicate(document, idDocType, id);
  }

  const name = data.name ?? existing.name;
  const rg = data.rg !== undefined ? data.rg || null : existing.rg;
  const phone = data.phone !== undefined ? data.phone || null : existing.phone;
  const status =
    data.status !== undefined ? (data.status ? 1 : 0) : existing.status;

  await db.execute(
    `UPDATE collaborator SET
       id_collaborator_document_type = ?,
       id_collaborator_role = ?,
       document = ?,
       name = ?,
       rg = ?,
       phone = ?,
       status = ?
     WHERE id_collaborator = ?`,
    [idDocType, idRole, document, name, rg, phone, status, id],
  );

  return getCollaboratorDetailById(id);
}

async function updateCollaboratorStatus(id, status) {
  const existing = await findCollaboratorById(id);
  if (!existing) throw new AppError("Colaborador não encontrado.", 404);

  const nextStatus = status ? 1 : 0;
  await db.execute("UPDATE collaborator SET status = ? WHERE id_collaborator = ?", [
    nextStatus,
    id,
  ]);

  const updated = await getCollaboratorDetailById(id);
  return {
    collaborator: updated,
    changes: {
      statusChanged: Boolean(existing.status) !== Boolean(nextStatus),
      wasActivated: !existing.status && nextStatus === 1,
      wasDeactivated: !!existing.status && nextStatus === 0,
    },
  };
}

async function addToBlacklist(id, reason, userId) {
  const existing = await findCollaboratorById(id);
  if (!existing) throw new AppError("Colaborador não encontrado.", 404);

  const already = await checkBlacklist(id);
  if (already) {
    throw new AppError("Colaborador já está na lista de restrição.", 409);
  }

  await db.execute(
    `INSERT INTO collaborator_black_list (id_collaborator, reason, id_usuario)
     VALUES (?, ?, ?)`,
    [id, reason, userId || null],
  );

  return getCollaboratorDetailById(id);
}

async function removeFromBlacklist(id) {
  const existing = await findCollaboratorById(id);
  if (!existing) throw new AppError("Colaborador não encontrado.", 404);

  const [result] = await db.execute(
    "DELETE FROM collaborator_black_list WHERE id_collaborator = ?",
    [id],
  );

  if (result.affectedRows === 0) {
    throw new AppError("Colaborador não está na lista de restrição.", 404);
  }

  return getCollaboratorDetailById(id);
}

function maskDocumentForAudit(collaborator) {
  const typeDesc = collaborator.document_type?.description || "";
  return maskDocument(collaborator.document, typeDesc);
}

module.exports = {
  parseListQuery,
  parseListFilters,
  assertAdminForList,
  assertCanWriteCollaborator,
  assertAdminForUpdate,
  isAdmin,
  getUserRole,
  listDocumentTypes,
  listRoles,
  listCollaborators,
  searchByDocument,
  getCollaboratorById,
  createCollaborator,
  updateCollaborator,
  updateCollaboratorStatus,
  addToBlacklist,
  removeFromBlacklist,
  checkBlacklist,
  maskDocumentForAudit,
  findCollaboratorById,
};
