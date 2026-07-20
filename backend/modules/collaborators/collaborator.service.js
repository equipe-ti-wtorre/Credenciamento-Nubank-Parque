const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const {
  maskDocument,
  mapDocumentType,
  mapRole,
  toMaskedCollaborator,
} = require("../../utils/privacy");
const { validateDocumentByType, validateAndNormalizeCollaboratorPayload } = require("./collaborator.schema");
const { parseBulkFile, normalizeBulkRow, isEmptyBulkRow } = require("./collaborator.bulk");
const { isSuperAdmin, hasPermission, getProfileCodigo } = require("../../utils/permissions");
const { savePreviewSession, getPreviewSession, deletePreviewSession } = require("../bulk/previewSession");
const { buildFieldDiffs, pickUpdatePatch, summarizePreviewRows } = require("../bulk/diff");

const COLLABORATOR_BULK_UPDATE_FIELDS = ["name", "id_collaborator_role", "rg", "phone"];
const COLLABORATOR_SELECT = `
  SELECT c.*,
         cdt.description AS document_type_description,
         cr.description AS role_description
  FROM collaborator c
  INNER JOIN collaborator_document_type cdt
    ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
  INNER JOIN collaborator_role cr ON cr.id_collaborator_role = c.id_collaborator_role
`;

function isAdmin(req) {
  return isSuperAdmin(req.user);
}

function assertAdminForList(req) {
  if (!hasPermission(req.user, "collaborators", "view")) {
    throw new AppError(
      "Listagem de colaboradores restrita. Use a busca por documento.",
      403,
    );
  }
}

function assertCanWriteCollaborator(req) {
  if (hasPermission(req.user, "collaborators", "create")) return;
  throw new AppError("Perfil sem permissão para cadastrar colaboradores.", 403);
}

function assertCanSearchCollaborator(req) {
  if (
    hasPermission(req.user, "collaborators", "view") ||
    hasPermission(req.user, "gate", "view")
  ) {
    return;
  }
  assertCanWriteCollaborator(req);
}

function assertAdminForUpdate(req) {
  if (!hasPermission(req.user, "collaborators", "edit")) {
    throw new AppError(
      "Edição de colaboradores restrita ao administrador nesta versão.",
      403,
    );
  }
}

function getUserRole(req) {
  return getProfileCodigo(req.user);
}

function mapCollaboratorRow(row, { isBlacklisted = false, canDelete = false } = {}) {
  return {
    id_collaborator: row.id_collaborator,
    id_collaborator_document_type: row.id_collaborator_document_type,
    id_collaborator_role: row.id_collaborator_role,
    document: row.document,
    name: row.name,
    rg: row.rg || null,
    phone: row.phone || null,
    picture: row.picture || null,
    status: !!row.status,
    is_blacklisted: !!isBlacklisted,
    can_delete: !!canDelete,
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
  const q = query.q || query.search;
  if (q) filters.q = String(q).trim();
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
  if (query.is_blacklisted !== undefined && query.is_blacklisted !== "") {
    filters.is_blacklisted =
      String(query.is_blacklisted).toLowerCase() === "true" ||
      query.is_blacklisted === "1";
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

async function findRoleByDescription(description) {
  const normalized = String(description || "").trim();
  const [rows] = await db.execute(
    `SELECT id_collaborator_role, description
     FROM collaborator_role WHERE description = ? LIMIT 1`,
    [normalized],
  );
  return rows[0] || null;
}

function mapRoleRow(row) {
  return {
    id_collaborator_role: row.id_collaborator_role,
    description: row.description,
  };
}

async function countRoleUsage(id) {
  const [collaboratorRows] = await db.execute(
    "SELECT COUNT(*) AS total FROM collaborator WHERE id_collaborator_role = ?",
    [id],
  );
  const [credentialRows] = await db.execute(
    "SELECT COUNT(*) AS total FROM event_day_company_collaborator WHERE id_collaborator_role = ?",
    [id],
  );
  const [serviceAccessRows] = await db.execute(
    "SELECT COUNT(*) AS total FROM service_access_collaborator WHERE id_collaborator_role = ?",
    [id],
  );

  return (
    Number(collaboratorRows[0]?.total || 0) +
    Number(credentialRows[0]?.total || 0) +
    Number(serviceAccessRows[0]?.total || 0)
  );
}

async function createRole(description) {
  const normalized = String(description || "").trim();
  const existing = await findRoleByDescription(normalized);
  if (existing) {
    throw new AppError("Já existe uma função com este nome.", 409);
  }

  const [result] = await db.execute(
    "INSERT INTO collaborator_role (description) VALUES (?)",
    [normalized],
  );
  const role = await findRoleById(result.insertId);
  return mapRoleRow(role);
}

async function updateRole(id, description) {
  const role = await findRoleById(id);
  if (!role) throw new AppError("Função não encontrada.", 404);

  const normalized = String(description || "").trim();
  const duplicate = await findRoleByDescription(normalized);
  if (duplicate && duplicate.id_collaborator_role !== Number(id)) {
    throw new AppError("Já existe uma função com este nome.", 409);
  }

  await db.execute("UPDATE collaborator_role SET description = ? WHERE id_collaborator_role = ?", [
    normalized,
    id,
  ]);

  const updated = await findRoleById(id);
  return mapRoleRow(updated);
}

async function deleteRole(id) {
  const role = await findRoleById(id);
  if (!role) throw new AppError("Função não encontrada.", 404);

  const usageCount = await countRoleUsage(id);
  if (usageCount > 0) {
    throw new AppError(
      "Não é possível excluir: a função está vinculada a colaboradores, credenciais ou acessos de serviço.",
      409,
    );
  }

  await db.execute("DELETE FROM collaborator_role WHERE id_collaborator_role = ?", [id]);
  return { success: true };
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

  if (filters.q) {
    conditions.push("(c.name LIKE ? OR c.document LIKE ?)");
    const term = `%${filters.q}%`;
    params.push(term, term);
  }
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
  if (filters.is_blacklisted !== undefined) {
    const existsSql =
      "EXISTS (SELECT 1 FROM collaborator_black_list bl WHERE bl.id_collaborator = c.id_collaborator)";
    conditions.push(filters.is_blacklisted ? existsSql : `NOT ${existsSql}`);
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
      const [isBlacklisted, usageCount] = await Promise.all([
        checkBlacklist(row.id_collaborator),
        countCollaboratorUsage(row.id_collaborator),
      ]);
      return mapCollaboratorRow(row, {
        isBlacklisted,
        canDelete: usageCount === 0,
      });
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

/** Typeahead por nome ou documento (formatado ou só dígitos). Retorna lista mascarada. */
async function searchCollaboratorsByTerm(req, { q, limit = 8 }) {
  assertCanSearchCollaborator(req);
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

  const max = Math.min(20, Math.max(1, Number(limit) || 8));
  const [rows] = await db.execute(
    `${COLLABORATOR_SELECT}
     WHERE c.status = 1 AND (${conditions.join(" OR ")})
     ORDER BY c.name ASC
     LIMIT ${max}`,
    params,
  );
  if (!rows.length) return { results: [] };

  const ids = rows.map((r) => r.id_collaborator);
  const [blRows] = await db.execute(
    `SELECT id_collaborator FROM collaborator_black_list
     WHERE id_collaborator IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  const blacklisted = new Set(blRows.map((r) => Number(r.id_collaborator)));

  return {
    results: rows.map((row) =>
      toMaskedCollaborator(row, {
        isBlacklisted: blacklisted.has(Number(row.id_collaborator)),
      }),
    ),
  };
}

async function getCollaboratorById(req, id) {
  const row = await findCollaboratorById(id);
  if (!row) throw new AppError("Colaborador não encontrado.", 404);

  const isBlacklisted = await checkBlacklist(row.id_collaborator);

  if (isAdmin(req) || hasPermission(req.user, "collaborators", "edit")) {
    return mapCollaboratorRow(row, { isBlacklisted });
  }

  if (req.user?.requires_company) {
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

async function insertCollaboratorRecord(data) {
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

async function createCollaborator(req, data) {
  assertCanWriteCollaborator(req);
  return insertCollaboratorRecord(data);
}

async function getCollaboratorBulkTemplate() {
  const { buildCollaboratorBulkTemplate } = require("../../utils/bulkTemplateXlsx");
  const [types, roles] = await Promise.all([listDocumentTypes(), listRoles()]);
  return buildCollaboratorBulkTemplate({ types, roles });
}

async function bulkCreateCollaborators(req, file) {
  assertCanWriteCollaborator(req);
  const rawRows = await parseBulkFile(file.buffer, file.mimetype, file.originalname);
  const errors = [];
  let successCount = 0;
  let totalProcessed = 0;

  for (let i = 0; i < rawRows.length; i++) {
    if (isEmptyBulkRow(rawRows[i])) continue;
    const line = i + 2;
    totalProcessed += 1;
    const payload = normalizeBulkRow(rawRows[i]);

    const validated = await validateAndNormalizeCollaboratorPayload(payload);
    if (validated.error) {
      errors.push({ line, reason: validated.error });
      continue;
    }

    try {
      await insertCollaboratorRecord(validated.value);
      successCount += 1;
    } catch (err) {
      if (err instanceof AppError) {
        errors.push({ line, reason: err.message });
      } else if (err.code === "ER_DUP_ENTRY") {
        errors.push({ line, reason: "Colaborador já cadastrado com este documento." });
      } else {
        errors.push({ line, reason: "Erro ao inserir registro." });
      }
    }
  }

  if (totalProcessed === 0) {
    throw new AppError(
      "Nenhuma linha de dados encontrada. Cabeçalho: document, id_collaborator_document_type, name, id_collaborator_role.",
      400,
    );
  }

  return { totalProcessed, successCount, errors };
}

function publicCollaboratorExisting(row) {
  return {
    id_collaborator: row.id_collaborator,
    document: row.document,
    id_collaborator_document_type: row.id_collaborator_document_type,
    name: row.name,
    id_collaborator_role: row.id_collaborator_role,
    rg: row.rg || null,
    phone: row.phone || null,
    status: !!row.status,
  };
}

async function previewBulkCollaborators(req, file) {
  assertCanWriteCollaborator(req);
  if (!hasPermission(req.user, "collaborators", "edit") && !hasPermission(req.user, "collaborators", "create")) {
    throw new AppError("Perfil sem permissão para importar colaboradores.", 403);
  }

  const rawRows = await parseBulkFile(file.buffer, file.mimetype, file.originalname);
  const rows = [];
  const sessionRows = [];

  for (let i = 0; i < rawRows.length; i++) {
    if (isEmptyBulkRow(rawRows[i])) continue;
    const line = i + 2;
    const payload = normalizeBulkRow(rawRows[i]);
    const validated = await validateAndNormalizeCollaboratorPayload(payload);
    if (validated.error) {
      const item = {
        line,
        status: "error",
        key: {
          document: payload.document,
          id_collaborator_document_type: payload.id_collaborator_document_type,
        },
        incoming: payload,
        message: validated.error,
      };
      rows.push(item);
      sessionRows.push({ ...item, validated: null, existingId: null });
      continue;
    }

    const value = validated.value;
    const existing = await findCollaboratorByDocument(
      value.document,
      value.id_collaborator_document_type,
    );

    if (!existing) {
      const item = {
        line,
        status: "create",
        key: {
          document: value.document,
          id_collaborator_document_type: value.id_collaborator_document_type,
        },
        incoming: value,
      };
      rows.push(item);
      sessionRows.push({ ...item, validated: value, existingId: null });
      continue;
    }

    const existingPublic = publicCollaboratorExisting(existing);
    const diffs = buildFieldDiffs(existingPublic, value, COLLABORATOR_BULK_UPDATE_FIELDS);
    const item = {
      line,
      status: diffs.length ? "update" : "link",
      key: {
        document: value.document,
        id_collaborator_document_type: value.id_collaborator_document_type,
      },
      incoming: value,
      existing: existingPublic,
      diffs,
      message: diffs.length ? undefined : "Cadastro idêntico ao existente — nada a atualizar.",
    };
    // Sem divergência: tratar como skip sugerido (status link = sem mudança cadastral)
    if (!diffs.length) {
      item.status = "link";
    }
    rows.push(item);
    sessionRows.push({
      ...item,
      validated: value,
      existingId: existing.id_collaborator,
    });
  }

  if (!rows.length) {
    throw new AppError(
      "Nenhuma linha de dados encontrada. Cabeçalho: document, id_collaborator_document_type, name, id_collaborator_role.",
      400,
    );
  }

  const previewId = savePreviewSession({
    kind: "collaborators",
    userId: req.user?.id || null,
    rows: sessionRows,
  });

  return {
    previewId,
    summary: summarizePreviewRows(rows),
    rows,
    updateFields: COLLABORATOR_BULK_UPDATE_FIELDS,
  };
}

async function commitBulkCollaborators(req, { previewId, decisions }) {
  assertCanWriteCollaborator(req);
  if (!hasPermission(req.user, "collaborators", "edit") && !hasPermission(req.user, "collaborators", "create")) {
    throw new AppError("Perfil sem permissão para importar colaboradores.", 403);
  }

  const session = getPreviewSession(previewId, "collaborators");
  if (session.userId && req.user?.id && Number(session.userId) !== Number(req.user.id)) {
    throw new AppError("Pré-visualização pertence a outro usuário.", 403);
  }

  const byLine = new Map(session.rows.map((r) => [r.line, r]));
  const decisionList = Array.isArray(decisions) ? decisions : [];
  const errors = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let linked = 0;

  for (const decision of decisionList) {
    const line = Number(decision.line);
    const action = decision.action;
    const row = byLine.get(line);
    if (!row) {
      errors.push({ line, reason: "Linha não encontrada na pré-visualização." });
      continue;
    }
    if (action === "skip") {
      skipped += 1;
      continue;
    }
    if (row.status === "error") {
      errors.push({ line, reason: row.message || "Linha com erro." });
      continue;
    }

    try {
      if (action === "create") {
        if (row.status !== "create" || !row.validated) {
          errors.push({ line, reason: "Linha não é um novo cadastro." });
          continue;
        }
        if (!hasPermission(req.user, "collaborators", "create")) {
          errors.push({ line, reason: "Sem permissão para criar." });
          continue;
        }
        await insertCollaboratorRecord(row.validated);
        created += 1;
      } else if (action === "update") {
        if (!row.existingId || !row.validated) {
          errors.push({ line, reason: "Linha não possui cadastro existente para atualizar." });
          continue;
        }
        if (!hasPermission(req.user, "collaborators", "edit")) {
          errors.push({ line, reason: "Sem permissão para editar." });
          continue;
        }
        const patch = pickUpdatePatch(
          row.validated,
          decision.fields,
          COLLABORATOR_BULK_UPDATE_FIELDS,
        );
        if (!Object.keys(patch).length) {
          skipped += 1;
          continue;
        }
        await updateCollaborator(req, row.existingId, patch);
        updated += 1;
      } else if (action === "link") {
        // Cadastro já existe sem diffs: nada a gravar.
        linked += 1;
      } else {
        errors.push({ line, reason: `Ação inválida: ${action}` });
      }
    } catch (err) {
      errors.push({
        line,
        reason: err instanceof AppError ? err.message : "Erro ao aplicar linha.",
      });
    }
  }

  deletePreviewSession(previewId);

  return {
    created,
    updated,
    linked,
    skipped,
    errors,
    totalDecisions: decisionList.length,
  };
}

async function updateCollaboratorPicture(id, filename) {
  const existing = await findCollaboratorById(id);
  if (!existing) throw new AppError("Colaborador não encontrado.", 404);
  await db.execute("UPDATE collaborator SET picture = ? WHERE id_collaborator = ?", [
    filename,
    id,
  ]);
  return getCollaboratorDetailById(id);
}

async function clearCollaboratorPicture(id) {
  const existing = await findCollaboratorById(id);
  if (!existing) throw new AppError("Colaborador não encontrado.", 404);
  await db.execute("UPDATE collaborator SET picture = NULL WHERE id_collaborator = ?", [id]);
  return getCollaboratorDetailById(id);
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

/**
 * Atualização pontual de campos (bulk / acesso serviço).
 */
async function applyCollaboratorFieldPatch(id, data) {
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

  const name = data.name ?? existing.name;
  const rg = data.rg !== undefined ? data.rg || null : existing.rg;
  const phone = data.phone !== undefined ? data.phone || null : existing.phone;

  await db.execute(
    `UPDATE collaborator SET
       id_collaborator_document_type = ?,
       id_collaborator_role = ?,
       name = ?,
       rg = ?,
       phone = ?
     WHERE id_collaborator = ?`,
    [idDocType, idRole, name, rg, phone, id],
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

async function countCollaboratorUsage(id) {
  const [credentialRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM event_day_company_collaborator
     WHERE id_collaborator = ? OR id_substitute = ?`,
    [id, id],
  );
  const [serviceAccessRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM service_access_collaborator
     WHERE id_collaborator = ? OR id_substitute = ?`,
    [id, id],
  );
  const [movementRows] = await db.execute(
    "SELECT COUNT(*) AS total FROM material_movement WHERE id_collaborator = ?",
    [id],
  );
  const [documentChangeRows] = await db.execute(
    "SELECT COUNT(*) AS total FROM document_change_request WHERE id_collaborator = ?",
    [id],
  );

  return (
    Number(credentialRows[0]?.total || 0) +
    Number(serviceAccessRows[0]?.total || 0) +
    Number(movementRows[0]?.total || 0) +
    Number(documentChangeRows[0]?.total || 0)
  );
}

async function deleteCollaborator(id) {
  const existing = await findCollaboratorById(id);
  if (!existing) throw new AppError("Colaborador não encontrado.", 404);

  const usageCount = await countCollaboratorUsage(id);
  if (usageCount > 0) {
    throw new AppError(
      "Não é possível excluir: o colaborador está vinculado a credenciais, acessos de serviço, movimentações ou solicitações de documento.",
      409,
    );
  }

  await db.execute("DELETE FROM collaborator WHERE id_collaborator = ?", [id]);
  return { success: true };
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
  createRole,
  updateRole,
  deleteRole,
  countRoleUsage,
  listCollaborators,
  searchByDocument,
  searchCollaboratorsByTerm,
  getCollaboratorById,
  createCollaborator,
  getCollaboratorBulkTemplate,
  bulkCreateCollaborators,
  previewBulkCollaborators,
  commitBulkCollaborators,
  insertCollaboratorRecord,
  updateCollaboratorPicture,
  clearCollaboratorPicture,
  updateCollaborator,
  applyCollaboratorFieldPatch,
  updateCollaboratorStatus,
  addToBlacklist,
  removeFromBlacklist,
  countCollaboratorUsage,
  deleteCollaborator,
  checkBlacklist,
  maskDocumentForAudit,
  findCollaboratorById,
};
