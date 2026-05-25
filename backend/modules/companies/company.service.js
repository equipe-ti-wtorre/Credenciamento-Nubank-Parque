const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { normalizeCnpj, isValidCnpj } = require("../../utils/cnpj");

const TYPE_EMPRESA_PADRAO = "Empresa Padrão";

let cachedEmpresaPadraoTypeId = null;

async function getEmpresaPadraoTypeId() {
  if (cachedEmpresaPadraoTypeId != null) return cachedEmpresaPadraoTypeId;
  const [rows] = await db.execute(
    "SELECT id_company_type FROM company_type WHERE description = ? LIMIT 1",
    [TYPE_EMPRESA_PADRAO],
  );
  if (rows.length === 0) {
    throw new AppError("Tipo de empresa 'Empresa Padrão' não configurado.", 500);
  }
  cachedEmpresaPadraoTypeId = rows[0].id_company_type;
  return cachedEmpresaPadraoTypeId;
}

function getUserRole(req) {
  return String(req.user?.role || req.user?.perfil || "USER").toUpperCase();
}

function buildCompanyScope(req) {
  const role = getUserRole(req);
  const idCompany = req.user?.id_company != null ? Number(req.user.id_company) : null;

  if (role === "ADMIN") {
    return { mode: "admin" };
  }
  if (role === "PRODUTORA") {
    if (!idCompany) {
      throw new AppError("Usuário produtora sem empresa vinculada.", 403);
    }
    return { mode: "produtora", ownCompanyId: idCompany };
  }
  if (role === "PADRAO") {
    if (!idCompany) {
      throw new AppError("Usuário sem empresa vinculada.", 403);
    }
    return { mode: "padrao", onlyCompanyId: idCompany };
  }
  throw new AppError("Perfil sem permissão para consultar empresas.", 403);
}

async function applyScopeToWhere(scope, alias = "c") {
  const conditions = [];
  const params = [];

  if (scope.mode === "admin") {
    return { conditions, params };
  }

  if (scope.mode === "padrao") {
    conditions.push(`${alias}.id_company = ?`);
    params.push(scope.onlyCompanyId);
    return { conditions, params };
  }

  if (scope.mode === "produtora") {
    const padraoTypeId = await getEmpresaPadraoTypeId();
    conditions.push(`(${alias}.id_company = ? OR ${alias}.id_company_type = ?)`);
    params.push(scope.ownCompanyId, padraoTypeId);
    return { conditions, params };
  }

  return { conditions, params };
}

async function assertCanReadCompany(req, companyRow) {
  const scope = buildCompanyScope(req);
  if (scope.mode === "admin") return;

  const id = companyRow.id_company;

  if (scope.mode === "padrao") {
    if (id !== scope.onlyCompanyId) {
      throw new AppError("Empresa não encontrada.", 404);
    }
    return;
  }

  if (scope.mode === "produtora") {
    if (id === scope.ownCompanyId) return;
    const padraoTypeId = await getEmpresaPadraoTypeId();
    if (companyRow.id_company_type === padraoTypeId) return;
    throw new AppError("Empresa não encontrada.", 404);
  }
}

function mapCompanyType(row) {
  if (!row || row.id_company_type == null) return null;
  return {
    id_company_type: row.id_company_type,
    description: row.type_description ?? row.description,
  };
}

function mapContactRow(row) {
  return {
    id_company_contact: row.id_company_contact,
    id_company: row.id_company,
    name: row.name,
    department: row.department || null,
    phone: row.phone || null,
    email: row.email || null,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function mapCompanyRow(row, contacts = null) {
  const company = {
    id_company: row.id_company,
    id_company_type: row.id_company_type,
    cnpj: row.cnpj,
    company_name: row.company_name,
    fancy_name: row.fancy_name || null,
    status: !!row.status,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    company_type: mapCompanyType(row),
  };
  if (contacts !== null) {
    company.contacts = contacts;
  }
  return company;
}

function parseListQuery(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit };
}

function parseListFilters(query) {
  const filters = {};
  if (query.cnpj) filters.cnpj = normalizeCnpj(query.cnpj);
  if (query.name) filters.name = String(query.name).trim();
  if (query.id_company_type != null && query.id_company_type !== "") {
    filters.id_company_type = parseInt(query.id_company_type, 10);
  }
  return filters;
}

function buildListWhere(scope, filters) {
  const conditions = [];
  const params = [];

  return applyScopeToWhere(scope).then(({ conditions: scopeConds, params: scopeParams }) => {
    conditions.push(...scopeConds);
    params.push(...scopeParams);

    if (filters.cnpj) {
      conditions.push("c.cnpj = ?");
      params.push(filters.cnpj);
    }
    if (filters.name) {
      const term = `%${filters.name}%`;
      conditions.push("(c.company_name LIKE ? OR c.fancy_name LIKE ?)");
      params.push(term, term);
    }
    if (filters.id_company_type) {
      conditions.push("c.id_company_type = ?");
      params.push(filters.id_company_type);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return { where, params };
  });
}

async function listCompanyTypes() {
  const [rows] = await db.execute(
    "SELECT id_company_type, description FROM company_type ORDER BY description ASC",
  );
  return rows.map((r) => ({
    id_company_type: r.id_company_type,
    description: r.description,
  }));
}

async function findCompanyTypeById(id) {
  const [rows] = await db.execute(
    "SELECT id_company_type, description FROM company_type WHERE id_company_type = ? LIMIT 1",
    [id],
  );
  return rows[0] || null;
}

async function findCompanyById(id, conn = db) {
  const [rows] = await conn.execute(
    `SELECT c.*, ct.description AS type_description
     FROM company c
     INNER JOIN company_type ct ON ct.id_company_type = c.id_company_type
     WHERE c.id_company = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findContactsByCompanyId(id, conn = db) {
  const [rows] = await conn.execute(
    `SELECT * FROM company_contact WHERE id_company = ? ORDER BY name ASC`,
    [id],
  );
  return rows.map(mapContactRow);
}

async function listCompanies(req, { page, limit, filters }) {
  const scope = buildCompanyScope(req);
  const offset = (page - 1) * limit;
  const { where, params } = await buildListWhere(scope, filters);

  const [rows] = await db.execute(
    `SELECT c.*, ct.description AS type_description
     FROM company c
     INNER JOIN company_type ct ON ct.id_company_type = c.id_company_type
     ${where}
     ORDER BY c.company_name ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) AS total FROM company c ${where}`,
    params,
  );

  return {
    companies: rows.map((r) => mapCompanyRow(r)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function getCompanyDetailById(id) {
  const row = await findCompanyById(id);
  if (!row) throw new AppError("Empresa não encontrada.", 404);
  const contacts = await findContactsByCompanyId(id);
  return mapCompanyRow(row, contacts);
}

async function getCompanyById(req, id) {
  const row = await findCompanyById(id);
  if (!row) throw new AppError("Empresa não encontrada.", 404);
  await assertCanReadCompany(req, row);
  const contacts = await findContactsByCompanyId(id);
  return mapCompanyRow(row, contacts);
}

async function assertCompanyTypeExists(id) {
  const type = await findCompanyTypeById(id);
  if (!type) throw new AppError("Tipo de empresa inválido.", 400);
  return type;
}

function validateCnpjOrThrow(cnpj) {
  const normalized = normalizeCnpj(cnpj);
  if (!isValidCnpj(normalized)) {
    throw new AppError("CNPJ inválido.", 400);
  }
  return normalized;
}

async function insertContacts(conn, companyId, contacts) {
  if (!contacts || contacts.length === 0) return;
  for (const contact of contacts) {
    await conn.execute(
      `INSERT INTO company_contact (id_company, name, department, phone, email)
       VALUES (?, ?, ?, ?, ?)`,
      [
        companyId,
        contact.name,
        contact.department || null,
        contact.phone || null,
        contact.email || null,
      ],
    );
  }
}

async function createCompany(data) {
  await assertCompanyTypeExists(data.id_company_type);
  const cnpj = validateCnpjOrThrow(data.cnpj);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO company (id_company_type, cnpj, company_name, fancy_name, status)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.id_company_type,
        cnpj,
        data.company_name,
        data.fancy_name || null,
        data.status !== false ? 1 : 0,
      ],
    );

    const companyId = result.insertId;
    await insertContacts(conn, companyId, data.contacts);

    await conn.commit();
    return getCompanyDetailById(companyId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateCompany(id, data) {
  const existing = await findCompanyById(id);
  if (!existing) throw new AppError("Empresa não encontrada.", 404);

  const idCompanyType = data.id_company_type ?? existing.id_company_type;
  if (data.id_company_type != null) {
    await assertCompanyTypeExists(idCompanyType);
  }

  const cnpj =
    data.cnpj != null ? validateCnpjOrThrow(data.cnpj) : existing.cnpj;
  const companyName = data.company_name ?? existing.company_name;
  const fancyName =
    data.fancy_name !== undefined ? data.fancy_name || null : existing.fancy_name;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE company SET id_company_type = ?, cnpj = ?, company_name = ?, fancy_name = ? WHERE id_company = ?`,
      [idCompanyType, cnpj, companyName, fancyName, id],
    );

    if (data.contacts !== undefined) {
      await conn.execute("DELETE FROM company_contact WHERE id_company = ?", [id]);
      await insertContacts(conn, id, data.contacts);
    }

    await conn.commit();
    return getCompanyDetailById(id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateCompanyStatus(id, status) {
  const existing = await findCompanyById(id);
  if (!existing) throw new AppError("Empresa não encontrada.", 404);

  const nextStatus = status ? 1 : 0;
  await db.execute("UPDATE company SET status = ? WHERE id_company = ?", [
    nextStatus,
    id,
  ]);

  const updated = await findCompanyById(id);
  return {
    company: mapCompanyRow(updated),
    changes: {
      statusChanged: existing.status !== nextStatus,
      wasActivated: existing.status === 0 && nextStatus === 1,
      wasDeactivated: existing.status === 1 && nextStatus === 0,
    },
  };
}

async function findActiveCompanyById(id) {
  const row = await findCompanyById(id);
  if (!row) return null;
  if (!row.status) return null;
  return row;
}

module.exports = {
  TYPE_EMPRESA_PADRAO,
  parseListQuery,
  parseListFilters,
  buildCompanyScope,
  listCompanyTypes,
  listCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  updateCompanyStatus,
  findActiveCompanyById,
  findCompanyById,
  mapCompanyRow,
};
