const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const {
  assertCanOperateOnLink,
  listCompanyLinksOnEvent,
  resolveInitialStatus,
} = require("../credentials/credentials.service");
const { getProfileCodigo, hasPermission, isSuperAdmin } = require("../../utils/permissions");

const VEHICLE_SELECT = `
  SELECT edcv.id_event_day_company_vehicle,
         edcv.id_event_day_company,
         edcv.id_vehicle,
         edcv.id_access_status,
         edcv.access_id,
         edcv.criado_em,
         edcv.atualizado_em,
         ast.description AS access_status_description,
         v.plate, v.brand, v.model, v.color, v.type, v.description,
         v.status AS vehicle_status, v.id_company,
         ed.date AS event_day_date, ed.id_event_day
    FROM event_day_company_vehicle edcv
    INNER JOIN access_status ast ON ast.id_access_status = edcv.id_access_status
    INNER JOIN vehicle v ON v.id_vehicle = edcv.id_vehicle
    INNER JOIN event_day_company edc ON edc.id_event_day_company = edcv.id_event_day_company
    INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
`;

function assertCanCreate(req) {
  const role = String(getProfileCodigo(req.user) || "").toUpperCase();
  if (
    isSuperAdmin(req.user) ||
    role === "ADMIN" ||
    role === "PRODUTORA" ||
    role === "PADRAO" ||
    hasPermission(req.user, "credentials", "create") ||
    hasPermission(req.user, "events", "edit")
  ) {
    return;
  }
  throw new AppError("Sem permissão para vincular veículos ao evento.", 403);
}

async function assertCompanyLinkedOnEvent(req, idEvent, idCompany, { requireCreate = false } = {}) {
  if (requireCreate) assertCanCreate(req);
  const links = await listCompanyLinksOnEvent(idEvent, idCompany);
  if (!links.length) {
    throw new AppError("Empresa não vinculada a este evento.", 404);
  }
  if (links[0] && links[0].event_ativo != null && !Number(links[0].event_ativo)) {
    throw new AppError("Evento desativado. Reative-o para continuar.", 403);
  }
  for (const link of links) {
    await assertCanOperateOnLink(req, link);
  }
  return links;
}

async function assertCanManageCompanyVehicles(req, idEvent, idCompany) {
  return assertCompanyLinkedOnEvent(req, idEvent, idCompany, { requireCreate: true });
}

function mapVehicleLinkRow(row) {
  return {
    id_event_day_company_vehicle: row.id_event_day_company_vehicle,
    id_event_day_company: row.id_event_day_company,
    id_vehicle: row.id_vehicle,
    id_access_status: row.id_access_status,
    access_status_description: row.access_status_description,
    access_id: row.access_id,
    event_day_date: row.event_day_date,
    id_event_day: row.id_event_day,
    vehicle: {
      id_vehicle: row.id_vehicle,
      plate: row.plate,
      brand: row.brand,
      model: row.model,
      color: row.color,
      type: row.type,
      description: row.description,
      status: !!row.vehicle_status,
      id_company: row.id_company,
    },
  };
}

async function listCompanyVehicles(req, idEvent, idCompany) {
  // Leitura: basta a empresa estar no evento (ACL da rota + getEvent no FE).
  const links = await listCompanyLinksOnEvent(idEvent, idCompany);
  if (!links.length) {
    throw new AppError("Empresa não vinculada a este evento.", 404);
  }
  const linkIds = links.map((l) => Number(l.id_event_day_company));
  if (!linkIds.length) return { vehicles: [] };

  const [rows] = await db.execute(
    `${VEHICLE_SELECT}
     WHERE edcv.id_event_day_company IN (${linkIds.map(() => "?").join(",")})
     ORDER BY v.plate ASC, ed.date ASC`,
    linkIds,
  );

  // Agrega por veículo (um por empresa no evento)
  const byVehicle = new Map();
  for (const row of rows) {
    const id = Number(row.id_vehicle);
    if (!byVehicle.has(id)) {
      byVehicle.set(id, {
        id_vehicle: id,
        plate: row.plate,
        brand: row.brand,
        model: row.model,
        color: row.color,
        type: row.type,
        description: row.description,
        status: !!row.vehicle_status,
        id_access_status: row.id_access_status,
        access_status_description: row.access_status_description,
        linkIds: [],
        links: [],
      });
    }
    const item = byVehicle.get(id);
    item.linkIds.push(Number(row.id_event_day_company));
    item.links.push(mapVehicleLinkRow(row));
  }

  return { vehicles: [...byVehicle.values()] };
}

async function listEventVehicleCounts(idEvent, { onlyCompanyId } = {}) {
  const params = [idEvent];
  let companyFilter = "";
  if (onlyCompanyId != null) {
    companyFilter = " AND edc.id_company = ?";
    params.push(Number(onlyCompanyId));
  }
  const [rows] = await db.execute(
    `SELECT edc.id_company, COUNT(DISTINCT edcv.id_vehicle) AS vehicle_count
       FROM event_day_company_vehicle edcv
       INNER JOIN event_day_company edc ON edc.id_event_day_company = edcv.id_event_day_company
       INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
      WHERE ed.id_event = ?${companyFilter}
      GROUP BY edc.id_company`,
    params,
  );
  const map = {};
  for (const row of rows) {
    map[Number(row.id_company)] = Number(row.vehicle_count) || 0;
  }
  return map;
}

async function addCompanyVehicle(req, idEvent, idCompany, idVehicle) {
  const links = await assertCanManageCompanyVehicles(req, idEvent, idCompany);
  const vehicleId = Number(idVehicle);
  if (!vehicleId) throw new AppError("Veículo inválido.", 400);

  const [vRows] = await db.execute(
    `SELECT v.*, vbl.reason AS blacklist_reason
       FROM vehicle v
       LEFT JOIN vehicle_black_list vbl ON vbl.id_vehicle = v.id_vehicle
      WHERE v.id_vehicle = ? LIMIT 1`,
    [vehicleId],
  );
  const vehicle = vRows[0];
  if (!vehicle) throw new AppError("Veículo não encontrado.", 404);
  if (!vehicle.status) throw new AppError("Veículo inativo.", 400);
  if (vehicle.blacklist_reason) {
    throw new AppError("Veículo está na lista de restrição.", 403);
  }
  if (Number(vehicle.id_company) !== Number(idCompany)) {
    throw new AppError("Veículo não pertence a esta empresa.", 400);
  }

  const initialStatus = await resolveInitialStatus(req);
  let created = 0;
  let skipped = 0;

  for (const link of links) {
    try {
      const [result] = await db.execute(
        `INSERT INTO event_day_company_vehicle (
           id_event_day_company, id_vehicle, id_access_status
         ) VALUES (?, ?, ?)`,
        [link.id_event_day_company, vehicleId, initialStatus],
      );
      if (result.insertId) created += 1;
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }

  if (created === 0 && skipped > 0) {
    throw new AppError("Veículo já vinculado a todas as fases desta empresa.", 409);
  }

  const listed = await listCompanyVehicles(req, idEvent, idCompany);
  const item = listed.vehicles.find((v) => v.id_vehicle === vehicleId);
  return { vehicle: item, created, skipped };
}

async function removeCompanyVehicle(req, idEvent, idCompany, idVehicle) {
  const links = await assertCanManageCompanyVehicles(req, idEvent, idCompany);
  const vehicleId = Number(idVehicle);
  const linkIds = links.map((l) => Number(l.id_event_day_company));

  const [existing] = await db.execute(
    `SELECT id_event_day_company_vehicle, id_access_status, access_id
       FROM event_day_company_vehicle
      WHERE id_vehicle = ?
        AND id_event_day_company IN (${linkIds.map(() => "?").join(",")})`,
    [vehicleId, ...linkIds],
  );
  if (!existing.length) {
    throw new AppError("Veículo não vinculado a esta empresa no evento.", 404);
  }

  // Política semelhante a credenciais ativas: bloquear se já houver access_id gerado
  const active = existing.some((r) => r.access_id);
  if (active) {
    throw new AppError(
      "Não é possível remover veículo com acesso já liberado nas fases do evento.",
      409,
    );
  }

  await db.execute(
    `DELETE FROM event_day_company_vehicle
      WHERE id_vehicle = ?
        AND id_event_day_company IN (${linkIds.map(() => "?").join(",")})`,
    [vehicleId, ...linkIds],
  );

  return { removed: true, id_vehicle: vehicleId, count: existing.length };
}

async function linkVehicleToAllCompanyDays(conn, links, vehicleId, idAccessStatus) {
  let created = 0;
  for (const link of links) {
    const [result] = await conn.execute(
      `INSERT INTO event_day_company_vehicle (
         id_event_day_company, id_vehicle, id_access_status
       ) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE id_vehicle = VALUES(id_vehicle)`,
      [link.id_event_day_company, vehicleId, idAccessStatus],
    );
    if (result.affectedRows === 1) created += 1;
  }
  return created;
}

module.exports = {
  listCompanyVehicles,
  listEventVehicleCounts,
  addCompanyVehicle,
  removeCompanyVehicle,
  linkVehicleToAllCompanyDays,
  assertCanManageCompanyVehicles,
};
