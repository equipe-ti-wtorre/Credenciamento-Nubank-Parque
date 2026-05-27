const crypto = require("crypto");
const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { buildCompanyScope, applyScopeToWhere } = require("../companies/company.service");
const vehicleService = require("./vehicle.service");
const { STATUS_AGUARDANDO_ALLIANZ, STATUS_APROVADO, STATUS_NEGADO } = require("../credentials/credentials.schema");

const SERVICE_SELECT = `
  SELECT sa.*,
         ast.description AS access_status_description,
         c.fancy_name AS company_fancy_name
  FROM service_access sa
  INNER JOIN access_status ast ON ast.id_access_status = sa.id_access_status
  INNER JOIN company c ON c.id_company = sa.id_company
`;

function getUserRole(req) {
  return String(req.user?.role || req.user?.perfil || "USER").toUpperCase();
}

function assertCanManageServices(req) {
  const role = getUserRole(req);
  if (role === "ADMIN" || role === "PRODUTORA" || role === "PADRAO") return;
  throw new AppError("Perfil sem permissão para solicitações de serviço.", 403);
}

function resolveCompanyIdForCreate(req, bodyCompanyId) {
  const scope = buildCompanyScope(req);
  if (scope.mode === "admin") {
    if (!bodyCompanyId) throw new AppError("Informe a empresa.", 400);
    return bodyCompanyId;
  }
  if (scope.mode === "padrao" || scope.mode === "produtora") {
    return scope.onlyCompanyId ?? scope.ownCompanyId;
  }
  throw new AppError("Perfil sem permissão.", 403);
}

async function assertServiceInScope(req, row) {
  const scope = buildCompanyScope(req);
  if (scope.mode === "admin") return;
  if (scope.mode === "padrao") {
    if (row.id_company !== scope.onlyCompanyId) {
      throw new AppError("Solicitação não encontrada.", 404);
    }
    return;
  }
  if (scope.mode === "produtora") {
    const { conditions, params } = await applyScopeToWhere(scope, "c");
    const [rows] = await db.execute(
      `SELECT 1 FROM company c WHERE c.id_company = ? ${conditions.length ? `AND ${conditions.join(" AND ")}` : ""} LIMIT 1`,
      [row.id_company, ...params],
    );
    if (rows.length === 0) throw new AppError("Solicitação não encontrada.", 404);
  }
}

async function loadServiceVehicles(idServiceAccess) {
  const [rows] = await db.execute(
    `SELECT sav.*, v.plate, v.description AS vehicle_description
     FROM service_access_vehicle sav
     INNER JOIN vehicle v ON v.id_vehicle = sav.id_vehicle
     WHERE sav.id_service_access = ?
     ORDER BY v.plate ASC`,
    [idServiceAccess],
  );
  return rows.map((r) => ({
    id_service_access_vehicle: r.id_service_access_vehicle,
    id_vehicle: r.id_vehicle,
    plate: r.plate,
    vehicle_description: r.vehicle_description,
    access_id: r.access_id,
    check_in: r.check_in,
    check_out: r.check_out,
    id_substitute_vehicle: r.id_substitute_vehicle,
  }));
}

async function loadServiceDates(idServiceAccess) {
  const [rows] = await db.execute(
    `SELECT access_date FROM service_access_date WHERE id_service_access = ? ORDER BY access_date ASC`,
    [idServiceAccess],
  );
  return rows.map((r) => r.access_date);
}

function mapServiceRow(row, { vehicles = [], dates = [] } = {}) {
  return {
    id_service_access: row.id_service_access,
    id_company: row.id_company,
    id_access_status: row.id_access_status,
    access_status_description: row.access_status_description,
    service_type: row.service_type,
    description: row.description,
    company_fancy_name: row.company_fancy_name,
    vehicles,
    dates,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

async function listServiceAccess(req, { page = 1, limit = 20 } = {}) {
  assertCanManageServices(req);
  const scope = buildCompanyScope(req);
  const { conditions, params } = await applyScopeToWhere(scope, "c");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * limit;

  const [rows] = await db.execute(
    `${SERVICE_SELECT} ${where} ORDER BY sa.criado_em DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) AS total FROM service_access sa INNER JOIN company c ON c.id_company = sa.id_company ${where}`,
    params,
  );

  const services = await Promise.all(
    rows.map(async (row) => {
      const vehicles = await loadServiceVehicles(row.id_service_access);
      const dates = await loadServiceDates(row.id_service_access);
      return mapServiceRow(row, { vehicles, dates });
    }),
  );

  return {
    services,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

async function getServiceAccessById(req, id) {
  assertCanManageServices(req);
  const [rows] = await db.execute(`${SERVICE_SELECT} WHERE sa.id_service_access = ? LIMIT 1`, [id]);
  if (!rows[0]) throw new AppError("Solicitação não encontrada.", 404);
  await assertServiceInScope(req, rows[0]);
  const vehicles = await loadServiceVehicles(id);
  const dates = await loadServiceDates(id);
  return mapServiceRow(rows[0], { vehicles, dates });
}

async function createServiceAccess(req, data) {
  assertCanManageServices(req);
  const idCompany = resolveCompanyIdForCreate(req, data.id_company);
  const role = getUserRole(req);
  const initialStatus =
    role === "PADRAO" ? STATUS_AGUARDANDO_ALLIANZ : STATUS_AGUARDANDO_ALLIANZ;

  for (const idVehicle of data.id_vehicles) {
    const vehicle = await vehicleService.findVehicleById(idVehicle);
    if (!vehicle || vehicle.id_company !== idCompany) {
      throw new AppError(`Veículo ${idVehicle} inválido para esta empresa.`, 400);
    }
    if (!vehicle.status) {
      throw new AppError(`Veículo ${vehicle.plate} está inativo.`, 400);
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [saResult] = await conn.execute(
      `INSERT INTO service_access (id_company, id_access_status, service_type, description, id_usuario)
       VALUES (?, ?, ?, ?, ?)`,
      [
        idCompany,
        initialStatus,
        data.service_type,
        data.description || null,
        req.user?.id || null,
      ],
    );
    const idServiceAccess = saResult.insertId;

    for (const d of data.dates) {
      const dateStr = String(d).slice(0, 10);
      await conn.execute(
        `INSERT INTO service_access_date (id_service_access, access_date) VALUES (?, ?)`,
        [idServiceAccess, dateStr],
      );
    }

    for (const idVehicle of data.id_vehicles) {
      await conn.execute(
        `INSERT INTO service_access_vehicle (id_service_access, id_vehicle) VALUES (?, ?)`,
        [idServiceAccess, idVehicle],
      );
    }

    await conn.commit();
    return getServiceAccessById(req, idServiceAccess);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateServiceAccessStatus(req, id, { id_access_status: targetStatus, reason }) {
  const role = getUserRole(req);
  if (role !== "ADMIN") {
    throw new AppError("Apenas administrador pode alterar status de solicitação patrimonial.", 403);
  }

  const service = await getServiceAccessById(req, id);
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();
    await conn.execute(`UPDATE service_access SET id_access_status = ? WHERE id_service_access = ?`, [
      targetStatus,
      id,
    ]);

    if (targetStatus === STATUS_APROVADO) {
      const [vehicles] = await conn.execute(
        `SELECT id_service_access_vehicle FROM service_access_vehicle WHERE id_service_access = ?`,
        [id],
      );
      for (const v of vehicles) {
        const accessId = crypto.randomUUID();
        await conn.execute(
          `UPDATE service_access_vehicle SET access_id = ? WHERE id_service_access_vehicle = ?`,
          [accessId, v.id_service_access_vehicle],
        );
      }
    }

    if (targetStatus === STATUS_NEGADO && reason) {
      await conn.execute(`UPDATE service_access SET description = CONCAT(IFNULL(description,''), ?) WHERE id_service_access = ?`, [
        `\n[Negado] ${reason}`,
        id,
      ]);
    }

    await conn.commit();
    return getServiceAccessById(req, id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  listServiceAccess,
  getServiceAccessById,
  createServiceAccess,
  updateServiceAccessStatus,
};
