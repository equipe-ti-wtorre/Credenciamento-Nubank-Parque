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
    hasPermission(req.user, "gate", "view") ||
    hasPermission(req.user, "merchandise_entry", "view") ||
    hasPermission(req.user, "merchandise_exit", "view")
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
    id_company: row.id_company != null ? Number(row.id_company) : null,
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

const COMPANY_COLLABORATOR_SCOPE_SQL =
  "EXISTS (SELECT 1 FROM company_collaborator cc WHERE cc.id_collaborator = c.id_collaborator AND cc.id_company = ?)";

function getActorCompanyId(req) {
  if (!req.user?.requires_company) return null;
  const id = req.user?.id_company != null ? Number(req.user.id_company) : null;
  if (!id) {
    throw new AppError("Usuário sem empresa vinculada.", 403);
  }
  return id;
}

async function linkCollaboratorToCompany(idCollaborator, idCompany) {
  await db.execute(
    `INSERT IGNORE INTO company_collaborator (id_company, id_collaborator) VALUES (?, ?)`,
    [idCompany, idCollaborator],
  );
}

async function unlinkCollaboratorFromCompany(idCollaborator, idCompany) {
  const [result] = await db.execute(
    `DELETE FROM company_collaborator WHERE id_company = ? AND id_collaborator = ?`,
    [idCompany, idCollaborator],
  );
  return result.affectedRows > 0;
}

async function isCollaboratorLinkedToCompany(idCollaborator, idCompany) {
  const [rows] = await db.execute(
    `SELECT 1 FROM company_collaborator
      WHERE id_company = ? AND id_collaborator = ? LIMIT 1`,
    [idCompany, idCollaborator],
  );
  return rows.length > 0;
}

async function assertCollaboratorInCompanyScope(req, row) {
  const companyId = getActorCompanyId(req);
  if (companyId == null) return;
  const linked = await isCollaboratorLinkedToCompany(row.id_collaborator, companyId);
  if (!linked) {
    throw new AppError("Colaborador não encontrado.", 404);
  }
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

async function getBlacklistInfo(idCollaborator) {
  const [rows] = await db.execute(
    `SELECT reason FROM collaborator_black_list
      WHERE id_collaborator = ? LIMIT 1`,
    [idCollaborator],
  );
  if (!rows.length) {
    return { is_blacklisted: false, blacklist_reason: null };
  }
  const reason = rows[0].reason;
  return {
    is_blacklisted: true,
    blacklist_reason:
      reason != null && String(reason).trim() ? String(reason).trim() : null,
  };
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

function buildListWhere(filters, companyId = null) {
  const conditions = [];
  const params = [];

  if (companyId != null) {
    conditions.push(COMPANY_COLLABORATOR_SCOPE_SQL);
    params.push(companyId);
  }

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
  const companyId = getActorCompanyId(req);
  const { where, params } = buildListWhere(filters, companyId);

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
      let canDelete = true;
      if (companyId == null) {
        const usageCount = await countCollaboratorUsage(row.id_collaborator);
        canDelete = usageCount === 0;
      }
      return mapCollaboratorRow(row, {
        isBlacklisted,
        canDelete,
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
  await assertCollaboratorInCompanyScope(req, row);
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

  const companyId = getActorCompanyId(req);
  const scopeSql = companyId != null ? ` AND ${COMPANY_COLLABORATOR_SCOPE_SQL}` : "";
  if (companyId != null) params.push(companyId);

  const max = Math.min(20, Math.max(1, Number(limit) || 8));
  const [rows] = await db.execute(
    `${COLLABORATOR_SELECT}
     WHERE c.status = 1 AND (${conditions.join(" OR ")})${scopeSql}
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
  await assertCollaboratorInCompanyScope(req, row);

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

function toIsoDateTime(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return String(value);
}

async function getCollaboratorAccessDetails(req, id) {
  const row = await findCollaboratorById(id);
  if (!row) throw new AppError("Colaborador não encontrado.", 404);
  await assertCollaboratorInCompanyScope(req, row);

  const blacklist = await getBlacklistInfo(row.id_collaborator);
  let collaborator;
  if (isAdmin(req) || hasPermission(req.user, "collaborators", "edit")) {
    collaborator = mapCollaboratorRow(row, { isBlacklisted: blacklist.is_blacklisted });
  } else if (req.user?.requires_company) {
    collaborator = toMaskedCollaborator(row, { isBlacklisted: blacklist.is_blacklisted });
  } else {
    throw new AppError("Perfil sem permissão para consultar colaboradores.", 403);
  }
  collaborator.blacklist_reason = blacklist.blacklist_reason;

  const companyId = getActorCompanyId(req);
  const companyParams = [row.id_collaborator];
  let companySql = `
    SELECT co.id_company, co.fancy_name, co.company_name, co.cnpj
    FROM company_collaborator cc
    INNER JOIN company co ON co.id_company = cc.id_company
    WHERE cc.id_collaborator = ?`;
  if (companyId != null) {
    companySql += " AND cc.id_company = ?";
    companyParams.push(companyId);
  }
  companySql += " ORDER BY co.fancy_name ASC, co.company_name ASC";

  const [companyRows] = await db.execute(companySql, companyParams);
  const companyIds = companyRows.map((c) => Number(c.id_company));

  const accessesByCompany = new Map(companyIds.map((cid) => [cid, []]));

  if (companyIds.length > 0) {
    const placeholders = companyIds.map(() => "?").join(", ");

    const [serviceRows] = await db.execute(
      `SELECT
         sa.id_company,
         'service_collaborator' AS source,
         'Serviço — colaborador' AS source_label,
         COALESCE(NULLIF(TRIM(sa.finalidade), ''), sa.service_type, 'Acesso de serviço') AS context_name,
         DATE_FORMAT(gal.access_date, '%Y-%m-%d') AS access_date,
         gal.check_in,
         gal.check_out,
         gal.access_id
       FROM gate_access_day_log gal
       INNER JOIN service_access_collaborator sac
         ON sac.id_service_access_collaborator = gal.id_ref
       INNER JOIN service_access sa ON sa.id_service_access = gal.id_service_access
       WHERE gal.kind = 'collaborator'
         AND gal.check_in IS NOT NULL
         AND sac.id_collaborator = ?
         AND sa.id_company IN (${placeholders})
       ORDER BY gal.check_in DESC`,
      [row.id_collaborator, ...companyIds],
    );

    const [eventRows] = await db.execute(
      `SELECT
         edc.id_company,
         'event' AS source,
         'Credencial de evento' AS source_label,
         e.name AS context_name,
         DATE_FORMAT(COALESCE(ed.date, DATE(edcc.access_check_in)), '%Y-%m-%d') AS access_date,
         edcc.access_check_in AS check_in,
         edcc.access_check_out AS check_out,
         edcc.access_id
       FROM event_day_company_collaborator edcc
       INNER JOIN event_day_company edc
         ON edc.id_event_day_company = edcc.id_event_day_company
       INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
       INNER JOIN event e ON e.id_event = ed.id_event
       WHERE edcc.access_check_in IS NOT NULL
         AND edcc.id_collaborator = ?
         AND edc.id_company IN (${placeholders})
       ORDER BY edcc.access_check_in DESC`,
      [row.id_collaborator, ...companyIds],
    );

    for (const accessRow of [...serviceRows, ...eventRows]) {
      const cid = Number(accessRow.id_company);
      const list = accessesByCompany.get(cid);
      if (!list) continue;
      list.push({
        source: accessRow.source,
        source_label: accessRow.source_label,
        context_name: accessRow.context_name || "—",
        access_date: accessRow.access_date || null,
        check_in: toIsoDateTime(accessRow.check_in),
        check_out: toIsoDateTime(accessRow.check_out),
        access_id: accessRow.access_id || null,
      });
    }

    for (const list of accessesByCompany.values()) {
      list.sort((a, b) => {
        const ta = a.check_in ? new Date(a.check_in).getTime() : 0;
        const tb = b.check_in ? new Date(b.check_in).getTime() : 0;
        return tb - ta;
      });
    }
  }

  const companies = companyRows.map((c) => ({
    id_company: Number(c.id_company),
    fancy_name: c.fancy_name || null,
    company_name: c.company_name || null,
    cnpj: c.cnpj || null,
    accesses: accessesByCompany.get(Number(c.id_company)) || [],
  }));

  return { collaborator, companies };
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
  const companyId = getActorCompanyId(req);

  const existing = await findCollaboratorByDocument(
    data.document,
    data.id_collaborator_document_type,
  );
  if (existing) {
    if (companyId == null) {
      throw new AppError("Colaborador já cadastrado com este documento.", 409);
    }
    await linkCollaboratorToCompany(existing.id_collaborator, companyId);
    const collaborator = await getCollaboratorDetailById(existing.id_collaborator);
    return { collaborator, linked: true };
  }

  const collaborator = await insertCollaboratorRecord(data);
  if (companyId != null) {
    await linkCollaboratorToCompany(collaborator.id_collaborator, companyId);
  }
  return { collaborator, linked: false };
}

async function getCollaboratorBulkTemplate() {
  return require("./collaborator-bulk-import.flow").buildUnifiedTemplate();
}

async function bulkCreateCollaborators(req, file) {
  assertCanWriteCollaborator(req);
  const companyId = getActorCompanyId(req);
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
      const record = { ...validated.value };
      const existing = await findCollaboratorByDocument(
        record.document,
        record.id_collaborator_document_type,
      );
      if (existing) {
        if (companyId != null) {
          await linkCollaboratorToCompany(existing.id_collaborator, companyId);
          successCount += 1;
        } else {
          errors.push({ line, reason: "Colaborador já cadastrado com este documento." });
        }
        continue;
      }
      const created = await insertCollaboratorRecord(record);
      if (companyId != null) {
        await linkCollaboratorToCompany(created.id_collaborator, companyId);
      }
      successCount += 1;
    } catch (err) {
      if (err instanceof AppError) {
        errors.push({ line, reason: err.message });
      } else if (err.code === "ER_DUP_ENTRY") {
        if (companyId != null) {
          try {
            const dup = await findCollaboratorByDocument(
              validated.value.document,
              validated.value.id_collaborator_document_type,
            );
            if (dup) {
              await linkCollaboratorToCompany(dup.id_collaborator, companyId);
              successCount += 1;
              continue;
            }
          } catch (_) {
            /* fall through */
          }
        }
        errors.push({ line, reason: "Colaborador já cadastrado com este documento." });
      } else {
        errors.push({ line, reason: "Erro ao inserir registro." });
      }
    }
  }

  if (totalProcessed === 0) {
    throw new AppError(
      'Nenhuma linha de dados encontrada. Use o modelo unificado (aba "Colaboradores": Documento, Tipo de documento, Nome completo, Função / Cargo).',
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
  if (!file) throw new AppError("Arquivo obrigatório.", 400);

  return require("./collaborator-bulk-import.flow").previewUnifiedCollaboratorsBulk({
    file,
    userId: req.user?.id || null,
    getActorCompanyId: () => getActorCompanyId(req),
  });
}

async function commitBulkCollaborators(req, body = {}) {
  assertCanWriteCollaborator(req);
  if (!hasPermission(req.user, "collaborators", "edit") && !hasPermission(req.user, "collaborators", "create")) {
    throw new AppError("Perfil sem permissão para importar colaboradores.", 403);
  }

  const previewToken = body.previewToken || body.previewId;
  if (!previewToken) throw new AppError("previewToken é obrigatório.", 400);

  return require("./collaborator-bulk-import.flow").confirmUnifiedCollaboratorsBulk({
    req,
    previewToken,
    decisoes: body.decisoes || { colaboradores: body.decisions || [], veiculos: [] },
    insertCollaboratorRecord,
    linkCollaboratorToCompany,
    updateCollaborator,
    getActorCompanyId,
    hasPermission,
  });
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
  await assertCollaboratorInCompanyScope(req, existing);

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

async function revokeAccessesOnBlacklist(conn, collaboratorId, reason) {
  const {
    STATUS_AGUARDANDO_PRODUTORA,
    STATUS_AGUARDANDO_APROVACAO,
    STATUS_APROVADO,
    STATUS_NEGADO,
  } = require("../credentials/credentials.schema");

  const denialReason = `Lista de restrição: ${reason}`.slice(0, 500);

  await conn.execute(
    `UPDATE event_day_company_collaborator
     SET id_substitute = NULL
     WHERE id_substitute = ?`,
    [collaboratorId],
  );

  const [credRows] = await conn.execute(
    `SELECT id_event_day_company_collaborator, id_access_status
     FROM event_day_company_collaborator
     WHERE id_collaborator = ?
       AND id_access_status IN (?, ?, ?)`,
    [
      collaboratorId,
      STATUS_AGUARDANDO_PRODUTORA,
      STATUS_AGUARDANDO_APROVACAO,
      STATUS_APROVADO,
    ],
  );

  for (const row of credRows) {
    await conn.execute(
      `UPDATE event_day_company_collaborator
       SET id_access_status = ?
       WHERE id_event_day_company_collaborator = ?`,
      [STATUS_NEGADO, row.id_event_day_company_collaborator],
    );
    await conn.execute(
      `INSERT INTO event_day_company_collaborator_denied (
         id_event_day_company_collaborator, id_access_status, reason
       ) VALUES (?, ?, ?)`,
      [row.id_event_day_company_collaborator, row.id_access_status, denialReason],
    );
  }

  await conn.execute(
    `UPDATE service_access_collaborator
     SET id_substitute = NULL
     WHERE id_substitute = ?`,
    [collaboratorId],
  );

  // Mantém o vínculo na lista da portaria, mas invalida o QR (access_id).
  await conn.execute(
    `UPDATE service_access_collaborator
     SET access_id = NULL
     WHERE id_collaborator = ?
       AND (
         access_check_in IS NULL
         OR (access_check_out IS NOT NULL AND access_check_out >= access_check_in)
       )`,
    [collaboratorId],
  );
}

async function addToBlacklist(id, reason, userId) {
  const existing = await findCollaboratorById(id);
  if (!existing) throw new AppError("Colaborador não encontrado.", 404);

  const already = await checkBlacklist(id);
  if (already) {
    throw new AppError("Colaborador já está na lista de restrição.", 409);
  }

  const collaboratorId = Number(id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO collaborator_black_list (id_collaborator, reason, id_usuario)
       VALUES (?, ?, ?)`,
      [collaboratorId, reason, userId || null],
    );

    // Blacklist não altera status (Ativo/Inativo); apenas restringe credenciamento/portaria.
    await revokeAccessesOnBlacklist(conn, collaboratorId, reason);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

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
    `SELECT COUNT(*) AS total FROM (
       SELECT id_material_movement FROM material_movement WHERE id_collaborator = ?
       UNION
       SELECT id_material_movement FROM material_movement_collaborator WHERE id_collaborator = ?
     ) mm_usage`,
    [id, id],
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

async function deleteCollaborator(req, id) {
  const existing = await findCollaboratorById(id);
  if (!existing) throw new AppError("Colaborador não encontrado.", 404);

  const companyId = getActorCompanyId(req);
  if (companyId != null) {
    const unlinked = await unlinkCollaboratorFromCompany(id, companyId);
    if (!unlinked) {
      throw new AppError("Colaborador não encontrado.", 404);
    }
    return { success: true, unlinked: true };
  }

  const usageCount = await countCollaboratorUsage(id);
  if (usageCount > 0) {
    throw new AppError(
      "Não é possível excluir: o colaborador está vinculado a credenciais, acessos de serviço, movimentações ou solicitações de documento.",
      409,
    );
  }

  await db.execute("DELETE FROM collaborator WHERE id_collaborator = ?", [id]);
  return { success: true, unlinked: false };
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
  getCollaboratorAccessDetails,
  createCollaborator,
  getCollaboratorBulkTemplate,
  bulkCreateCollaborators,
  previewBulkCollaborators,
  commitBulkCollaborators,
  insertCollaboratorRecord,
  linkCollaboratorToCompany,
  unlinkCollaboratorFromCompany,
  isCollaboratorLinkedToCompany,
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
