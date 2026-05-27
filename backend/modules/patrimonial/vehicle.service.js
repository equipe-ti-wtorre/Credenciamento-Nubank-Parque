const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { normalizePlate, isValidPlate } = require("../../utils/plate");
const { buildCompanyScope, applyScopeToWhere } = require("../companies/company.service");

const VEHICLE_SELECT = `
  SELECT v.*, c.fancy_name AS company_fancy_name, c.company_name
  FROM vehicle v
  INNER JOIN company c ON c.id_company = v.id_company
`;

function getUserRole(req) {
  return String(req.user?.role || req.user?.perfil || "USER").toUpperCase();
}

function assertCanManageVehicles(req) {
  const role = getUserRole(req);
  if (role === "ADMIN" || role === "PRODUTORA" || role === "PADRAO") return;
  throw new AppError("Perfil sem permissão para gerenciar veículos.", 403);
}

async function assertVehicleInScope(req, vehicleRow) {
  const scope = buildCompanyScope(req);
  if (scope.mode === "admin") return;
  if (scope.mode === "padrao") {
    if (vehicleRow.id_company !== scope.onlyCompanyId) {
      throw new AppError("Veículo não encontrado.", 404);
    }
    return;
  }
  if (scope.mode === "produtora") {
    const { conditions, params } = await applyScopeToWhere(scope, "c");
    const [rows] = await db.execute(
      `SELECT 1 FROM company c WHERE c.id_company = ? ${conditions.length ? `AND ${conditions.join(" AND ")}` : ""} LIMIT 1`,
      [vehicleRow.id_company, ...params],
    );
    if (rows.length === 0) throw new AppError("Veículo não encontrado.", 404);
  }
}

function mapVehicleRow(row) {
  return {
    id_vehicle: row.id_vehicle,
    id_company: row.id_company,
    plate: row.plate,
    description: row.description || null,
    status: !!row.status,
    company_fancy_name: row.company_fancy_name || row.company_name,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function resolveCompanyIdForCreate(req, bodyCompanyId) {
  const scope = buildCompanyScope(req);
  if (scope.mode === "admin") {
    if (!bodyCompanyId) throw new AppError("Informe a empresa do veículo.", 400);
    return bodyCompanyId;
  }
  if (scope.mode === "padrao" || scope.mode === "produtora") {
    return scope.onlyCompanyId ?? scope.ownCompanyId;
  }
  throw new AppError("Perfil sem permissão.", 403);
}

async function listVehicles(req, { page = 1, limit = 20, filters = {} } = {}) {
  assertCanManageVehicles(req);
  const scope = buildCompanyScope(req);
  const { conditions, params } = await applyScopeToWhere(scope, "c");
  const extra = [...conditions];
  const extraParams = [...params];

  if (filters.plate) {
    extra.push("v.plate LIKE ?");
    extraParams.push(`%${normalizePlate(filters.plate)}%`);
  }
  if (filters.status !== undefined) {
    extra.push("v.status = ?");
    extraParams.push(filters.status ? 1 : 0);
  }

  const where = extra.length ? `WHERE ${extra.join(" AND ")}` : "";
  const offset = (page - 1) * limit;

  const [rows] = await db.execute(
    `${VEHICLE_SELECT} ${where} ORDER BY v.plate ASC LIMIT ? OFFSET ?`,
    [...extraParams, limit, offset],
  );

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) AS total FROM vehicle v INNER JOIN company c ON c.id_company = v.id_company ${where}`,
    extraParams,
  );

  return {
    vehicles: rows.map(mapVehicleRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function getVehicleById(req, id) {
  assertCanManageVehicles(req);
  const [rows] = await db.execute(`${VEHICLE_SELECT} WHERE v.id_vehicle = ? LIMIT 1`, [id]);
  if (!rows[0]) throw new AppError("Veículo não encontrado.", 404);
  await assertVehicleInScope(req, rows[0]);
  return mapVehicleRow(rows[0]);
}

async function createVehicle(req, data) {
  assertCanManageVehicles(req);
  const plate = normalizePlate(data.plate);
  if (!isValidPlate(plate)) {
    throw new AppError("Placa inválida. Use formato antigo (AAA0000) ou Mercosul (AAA0A00).", 400);
  }
  const idCompany = resolveCompanyIdForCreate(req, data.id_company);

  const [result] = await db.execute(
    `INSERT INTO vehicle (id_company, plate, description, status) VALUES (?, ?, ?, ?)`,
    [idCompany, plate, data.description || null, data.status !== false ? 1 : 0],
  );

  return getVehicleById(req, result.insertId);
}

async function updateVehicle(req, id, data) {
  assertCanManageVehicles(req);
  const existing = await getVehicleById(req, id);

  let plate = existing.plate;
  if (data.plate != null) {
    plate = normalizePlate(data.plate);
    if (!isValidPlate(plate)) {
      throw new AppError("Placa inválida.", 400);
    }
  }

  const description = data.description !== undefined ? data.description || null : existing.description;
  const status = data.status !== undefined ? (data.status ? 1 : 0) : existing.status ? 1 : 0;

  await db.execute(
    `UPDATE vehicle SET plate = ?, description = ?, status = ? WHERE id_vehicle = ?`,
    [plate, description, status, id],
  );

  return getVehicleById(req, id);
}

async function findVehicleById(id) {
  const [rows] = await db.execute(`${VEHICLE_SELECT} WHERE v.id_vehicle = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

module.exports = {
  assertCanManageVehicles,
  listVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  findVehicleById,
  mapVehicleRow,
};
