const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const db = require("../../config/db");
const AppError = require("../../utils/AppError");

const MERCHANDISE_STORAGE_DIR = path.join(__dirname, "../../storage/merchandise");

function getUserRole(req) {
  return String(req.user?.role || req.user?.perfil || "USER").toUpperCase();
}

function assertAdmin(req) {
  const role = String(req.user?.role || req.user?.perfil || "USER").toUpperCase();
  if (role !== "ADMIN") {
    throw new AppError("Perfil sem permissão para gerenciar cadastros de mercadorias.", 403);
  }
}

function assertOperator(req) {
  const role = getUserRole(req);
  if (role === "ADMIN" || role === "CONTROLADOR") return;
  throw new AppError("Perfil sem permissão para operações de mercadorias.", 403);
}

function mapLocation(row) {
  return {
    id_storage_location: row.id_storage_location,
    name: row.name,
    type: row.type,
    status: !!row.status,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function mapProduct(row) {
  return {
    id_product: row.id_product,
    description: row.description,
    unit_measure: row.unit_measure,
    manufacturer: row.manufacturer || null,
    status: !!row.status,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

async function listLocations(req) {
  assertAdmin(req);
  const [rows] = await db.execute(`SELECT * FROM storage_location ORDER BY name ASC`);
  return { locations: rows.map(mapLocation) };
}

async function createLocation(req, data) {
  assertAdmin(req);
  const [result] = await db.execute(
    `INSERT INTO storage_location (name, type, status) VALUES (?, ?, 1)`,
    [data.name.trim(), data.type],
  );
  const [rows] = await db.execute(
    `SELECT * FROM storage_location WHERE id_storage_location = ?`,
    [result.insertId],
  );
  return mapLocation(rows[0]);
}

async function updateLocation(req, id, data) {
  assertAdmin(req);
  const [existing] = await db.execute(
    `SELECT * FROM storage_location WHERE id_storage_location = ?`,
    [id],
  );
  if (existing.length === 0) throw new AppError("Local não encontrado.", 404);

  const fields = [];
  const params = [];
  if (data.name !== undefined) {
    fields.push("name = ?");
    params.push(data.name.trim());
  }
  if (data.type !== undefined) {
    fields.push("type = ?");
    params.push(data.type);
  }
  if (data.status !== undefined) {
    fields.push("status = ?");
    params.push(data.status ? 1 : 0);
  }
  if (fields.length === 0) return mapLocation(existing[0]);

  params.push(id);
  await db.execute(
    `UPDATE storage_location SET ${fields.join(", ")} WHERE id_storage_location = ?`,
    params,
  );
  const [rows] = await db.execute(
    `SELECT * FROM storage_location WHERE id_storage_location = ?`,
    [id],
  );
  return mapLocation(rows[0]);
}

async function listProducts(req) {
  assertAdmin(req);
  const [rows] = await db.execute(`SELECT * FROM product ORDER BY description ASC`);
  return { products: rows.map(mapProduct) };
}

async function createProduct(req, data) {
  assertAdmin(req);
  const manufacturer = data.manufacturer?.trim() || null;
  const [result] = await db.execute(
    `INSERT INTO product (description, unit_measure, manufacturer, status) VALUES (?, ?, ?, 1)`,
    [data.description.trim(), data.unit_measure.trim(), manufacturer],
  );
  const [rows] = await db.execute(`SELECT * FROM product WHERE id_product = ?`, [result.insertId]);
  return mapProduct(rows[0]);
}

async function updateProduct(req, id, data) {
  assertAdmin(req);
  const [existing] = await db.execute(`SELECT * FROM product WHERE id_product = ?`, [id]);
  if (existing.length === 0) throw new AppError("Produto não encontrado.", 404);

  const fields = [];
  const params = [];
  if (data.description !== undefined) {
    fields.push("description = ?");
    params.push(data.description.trim());
  }
  if (data.unit_measure !== undefined) {
    fields.push("unit_measure = ?");
    params.push(data.unit_measure.trim());
  }
  if (data.manufacturer !== undefined) {
    fields.push("manufacturer = ?");
    params.push(data.manufacturer?.trim() || null);
  }
  if (data.status !== undefined) {
    fields.push("status = ?");
    params.push(data.status ? 1 : 0);
  }
  if (fields.length === 0) return mapProduct(existing[0]);

  params.push(id);
  await db.execute(`UPDATE product SET ${fields.join(", ")} WHERE id_product = ?`, params);
  const [rows] = await db.execute(`SELECT * FROM product WHERE id_product = ?`, [id]);
  return mapProduct(rows[0]);
}

async function listLocationsForSelect(req) {
  assertOperator(req);
  const [rows] = await db.execute(
    `SELECT id_storage_location, name, type, status FROM storage_location WHERE status = 1 ORDER BY name ASC`,
  );
  return { locations: rows.map(mapLocation) };
}

async function listProductsForSelect(req) {
  assertOperator(req);
  const [rows] = await db.execute(
    `SELECT id_product, description, unit_measure, manufacturer, status FROM product WHERE status = 1 ORDER BY description ASC`,
  );
  return { products: rows.map(mapProduct) };
}

async function listCompaniesForSelect(req) {
  assertOperator(req);
  const [rows] = await db.execute(
    `SELECT id_company, fancy_name, company_name FROM company WHERE status = 1
     ORDER BY COALESCE(fancy_name, company_name) ASC`,
  );
  return {
    companies: rows.map((r) => ({
      id_company: r.id_company,
      name: r.fancy_name || r.company_name,
    })),
  };
}

async function listVehiclesForSelect(req, idCompany) {
  assertOperator(req);
  if (!idCompany) throw new AppError("Informe a empresa.", 400);
  await assertCompanyExists(idCompany);
  const [rows] = await db.execute(
    `SELECT id_vehicle, plate, description FROM vehicle WHERE id_company = ? AND status = 1 ORDER BY plate ASC`,
    [idCompany],
  );
  return {
    vehicles: rows.map((r) => ({
      id_vehicle: r.id_vehicle,
      plate: r.plate,
      description: r.description || null,
    })),
  };
}

async function assertCompanyExists(idCompany) {
  const [rows] = await db.execute(
    `SELECT id_company FROM company WHERE id_company = ? AND status = 1 LIMIT 1`,
    [idCompany],
  );
  if (rows.length === 0) throw new AppError("Empresa (agente) não encontrada ou inativa.", 400);
}

async function assertCollaboratorExists(idCollaborator) {
  const [rows] = await db.execute(
    `SELECT id_collaborator FROM collaborator WHERE id_collaborator = ? LIMIT 1`,
    [idCollaborator],
  );
  if (rows.length === 0) throw new AppError("Motorista não encontrado.", 400);
}

async function assertVehicleForCompany(idVehicle, idCompany) {
  const [rows] = await db.execute(
    `SELECT id_vehicle FROM vehicle WHERE id_vehicle = ? AND id_company = ? AND status = 1 LIMIT 1`,
    [idVehicle, idCompany],
  );
  if (rows.length === 0) {
    throw new AppError("Veículo não encontrado ou não pertence à empresa selecionada.", 400);
  }
}

async function assertActiveProduct(idProduct) {
  const [rows] = await db.execute(
    `SELECT id_product FROM product WHERE id_product = ? AND status = 1 LIMIT 1`,
    [idProduct],
  );
  if (rows.length === 0) throw new AppError(`Produto #${idProduct} inválido ou inativo.`, 400);
}

async function assertActiveLocation(idLocation) {
  const [rows] = await db.execute(
    `SELECT id_storage_location FROM storage_location WHERE id_storage_location = ? AND status = 1 LIMIT 1`,
    [idLocation],
  );
  if (rows.length === 0) {
    throw new AppError(`Local #${idLocation} inválido ou inativo.`, 400);
  }
}

async function getStockBalance(conn, idProduct, idStorageLocation) {
  const [rows] = await conn.execute(
    `SELECT COALESCE(SUM(
       CASE mm.movement_type WHEN 'ENTRADA' THEN mmi.quantity ELSE -mmi.quantity END
     ), 0) AS balance
     FROM material_movement_item mmi
     INNER JOIN material_movement mm ON mm.id_material_movement = mmi.id_material_movement
     WHERE mmi.id_product = ? AND mmi.id_storage_location = ?`,
    [idProduct, idStorageLocation],
  );
  return Number(rows[0]?.balance ?? 0);
}

function saveMovementPhoto(file) {
  if (!file) return null;
  fs.mkdirSync(MERCHANDISE_STORAGE_DIR, { recursive: true });
  const ext = path.extname(file.originalname || ".jpg").toLowerCase() || ".jpg";
  const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
  const filename = `${crypto.randomUUID()}${safeExt}`;
  fs.writeFileSync(path.join(MERCHANDISE_STORAGE_DIR, filename), file.buffer);
  return filename;
}

async function loadMovementItems(idMovement) {
  const [rows] = await db.execute(
    `SELECT mmi.*, p.description AS product_description, p.unit_measure,
            sl.name AS location_name, sl.type AS location_type
     FROM material_movement_item mmi
     INNER JOIN product p ON p.id_product = mmi.id_product
     INNER JOIN storage_location sl ON sl.id_storage_location = mmi.id_storage_location
     WHERE mmi.id_material_movement = ?
     ORDER BY mmi.id_material_movement_item ASC`,
    [idMovement],
  );
  return rows.map((r) => ({
    id_material_movement_item: r.id_material_movement_item,
    id_product: r.id_product,
    product_description: r.product_description,
    unit_measure: r.unit_measure,
    id_storage_location: r.id_storage_location,
    location_name: r.location_name,
    location_type: r.location_type,
    quantity: Number(r.quantity),
  }));
}

async function mapMovementRow(row) {
  const items = await loadMovementItems(row.id_material_movement);
  return {
    id_material_movement: row.id_material_movement,
    movement_type: row.movement_type,
    id_company: row.id_company,
    company_fancy_name: row.company_fancy_name || row.company_name,
    invoice_number: row.invoice_number,
    id_collaborator: row.id_collaborator,
    collaborator_name: row.collaborator_name,
    id_vehicle: row.id_vehicle,
    vehicle_plate: row.vehicle_plate,
    photo: row.photo || null,
    criado_em: row.criado_em,
    items,
  };
}

async function createMovement(req, movementType, payload, file) {
  assertOperator(req);
  await assertCompanyExists(payload.id_company);
  await assertCollaboratorExists(payload.id_collaborator);
  await assertVehicleForCompany(payload.id_vehicle, payload.id_company);

  for (const item of payload.items) {
    await assertActiveProduct(item.id_product);
    await assertActiveLocation(item.id_storage_location);
  }

  let photoFilename = saveMovementPhoto(file);
  const idUsuario = req.user?.id ?? req.user?.id_usuario ?? null;
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    if (movementType === "SAIDA") {
      for (const item of payload.items) {
        const balance = await getStockBalance(conn, item.id_product, item.id_storage_location);
        if (balance < item.quantity) {
          const [prod] = await conn.execute(`SELECT description FROM product WHERE id_product = ?`, [
            item.id_product,
          ]);
          const [loc] = await conn.execute(
            `SELECT name FROM storage_location WHERE id_storage_location = ?`,
            [item.id_storage_location],
          );
          throw new AppError(
            `Saldo insuficiente para "${prod[0]?.description || item.id_product}" em "${loc[0]?.name || item.id_storage_location}". Disponível: ${balance}, solicitado: ${item.quantity}.`,
            400,
          );
        }
      }
    }

    const [result] = await conn.execute(
      `INSERT INTO material_movement
       (movement_type, id_company, invoice_number, id_collaborator, id_vehicle, photo, id_usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        movementType,
        payload.id_company,
        payload.invoice_number.trim(),
        payload.id_collaborator,
        payload.id_vehicle,
        photoFilename,
        idUsuario,
      ],
    );

    for (const item of payload.items) {
      await conn.execute(
        `INSERT INTO material_movement_item
         (id_material_movement, id_product, id_storage_location, quantity)
         VALUES (?, ?, ?, ?)`,
        [result.insertId, item.id_product, item.id_storage_location, item.quantity],
      );
    }

    await conn.commit();

    const [rows] = await db.execute(
      `SELECT mm.*, c.fancy_name AS company_fancy_name, c.company_name,
              col.name AS collaborator_name, v.plate AS vehicle_plate
       FROM material_movement mm
       INNER JOIN company c ON c.id_company = mm.id_company
       INNER JOIN collaborator col ON col.id_collaborator = mm.id_collaborator
       INNER JOIN vehicle v ON v.id_vehicle = mm.id_vehicle
       WHERE mm.id_material_movement = ?`,
      [result.insertId],
    );
    return mapMovementRow(rows[0]);
  } catch (err) {
    await conn.rollback();
    if (photoFilename) {
      try {
        fs.unlinkSync(path.join(MERCHANDISE_STORAGE_DIR, photoFilename));
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function getStock(req) {
  assertAdmin(req);
  const [rows] = await db.execute(
    `SELECT
       mmi.id_product,
       p.description AS product_description,
       p.unit_measure,
       mmi.id_storage_location,
       sl.name AS location_name,
       sl.type AS location_type,
       COALESCE(SUM(
         CASE mm.movement_type WHEN 'ENTRADA' THEN mmi.quantity ELSE -mmi.quantity END
       ), 0) AS balance
     FROM material_movement_item mmi
     INNER JOIN material_movement mm ON mm.id_material_movement = mmi.id_material_movement
     INNER JOIN product p ON p.id_product = mmi.id_product
     INNER JOIN storage_location sl ON sl.id_storage_location = mmi.id_storage_location
     GROUP BY mmi.id_product, mmi.id_storage_location, p.description, p.unit_measure, sl.name, sl.type
     HAVING balance <> 0
     ORDER BY p.description ASC, sl.name ASC`,
  );
  return {
    stock: rows.map((r) => ({
      id_product: r.id_product,
      product_description: r.product_description,
      unit_measure: r.unit_measure,
      id_storage_location: r.id_storage_location,
      location_name: r.location_name,
      location_type: r.location_type,
      balance: Number(r.balance),
    })),
  };
}

async function getHistory(req, query) {
  assertAdmin(req);
  const page = query.page;
  const limit = query.limit;
  const offset = (page - 1) * limit;
  const conditions = ["1=1"];
  const params = [];

  if (query.from) {
    conditions.push("DATE(mm.criado_em) >= ?");
    params.push(query.from);
  }
  if (query.to) {
    conditions.push("DATE(mm.criado_em) <= ?");
    params.push(query.to);
  }
  if (query.movement_type) {
    conditions.push("mm.movement_type = ?");
    params.push(query.movement_type);
  }
  if (query.id_company) {
    conditions.push("mm.id_company = ?");
    params.push(query.id_company);
  }

  const where = conditions.join(" AND ");
  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM material_movement mm WHERE ${where}`,
    params,
  );
  const total = countRows[0]?.total ?? 0;

  const [rows] = await db.execute(
    `SELECT mm.*, c.fancy_name AS company_fancy_name, c.company_name,
            col.name AS collaborator_name, v.plate AS vehicle_plate
     FROM material_movement mm
     INNER JOIN company c ON c.id_company = mm.id_company
     INNER JOIN collaborator col ON col.id_collaborator = mm.id_collaborator
     INNER JOIN vehicle v ON v.id_vehicle = mm.id_vehicle
     WHERE ${where}
     ORDER BY mm.criado_em DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const movements = [];
  for (const row of rows) {
    movements.push(await mapMovementRow(row));
  }
  return { movements, page, limit, total };
}

async function getDashboard(req, { days = 7 }) {
  assertAdmin(req);

  const [seriesRows] = await db.execute(
    `SELECT DATE(mm.criado_em) AS day,
            mm.movement_type,
            COUNT(*) AS movement_count
     FROM material_movement mm
     WHERE mm.criado_em >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(mm.criado_em), mm.movement_type
     ORDER BY day ASC`,
    [days - 1],
  );

  const dayMap = new Map();
  for (const row of seriesRows) {
    const dayKey = String(row.day).slice(0, 10);
    if (!dayMap.has(dayKey)) {
      dayMap.set(dayKey, {
        day: dayKey,
        entrada_count: 0,
        saida_count: 0,
      });
    }
    const entry = dayMap.get(dayKey);
    if (row.movement_type === "ENTRADA") {
      entry.entrada_count = Number(row.movement_count);
    } else {
      entry.saida_count = Number(row.movement_count);
    }
  }

  const [totals] = await db.execute(
    `SELECT movement_type, COUNT(*) AS cnt
     FROM material_movement
     WHERE criado_em >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY movement_type`,
    [days - 1],
  );

  let totalEntrada = 0;
  let totalSaida = 0;
  for (const t of totals) {
    if (t.movement_type === "ENTRADA") totalEntrada = Number(t.cnt);
    if (t.movement_type === "SAIDA") totalSaida = Number(t.cnt);
  }

  return {
    days,
    series: Array.from(dayMap.values()),
    totals: { entrada: totalEntrada, saida: totalSaida },
  };
}

module.exports = {
  listLocations,
  createLocation,
  updateLocation,
  listProducts,
  createProduct,
  updateProduct,
  listLocationsForSelect,
  listProductsForSelect,
  listCompaniesForSelect,
  listVehiclesForSelect,
  createMovement,
  getStock,
  getHistory,
  getDashboard,
};
