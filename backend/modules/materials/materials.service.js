const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { normalizePlate, isValidPlate } = require("../../utils/plate");
const { isValidCnpj, normalizeCnpj } = require("../../utils/cnpj");
const { isValidCpf, normalizeCpf } = require("../../utils/cpf");
const {
  getActiveBlock,
  ERROR_CODE: BLOCKLIST_ERROR_CODE,
} = require("../collaborator-blocklist/blocklist.policy");

const { hasPermission, assertPermission } = require("../../utils/permissions");

const MERCHANDISE_STORAGE_DIR = path.join(__dirname, "../../storage/merchandise");

function assertAdmin(req) {
  assertPermission(req.user, "merchandise_products", "view");
}

function assertReportsView(req) {
  assertPermission(req.user, "merchandise_reports", "view");
}

function assertProductCreateAccess(req) {
  if (
    hasPermission(req.user, "merchandise_products", "create") ||
    hasPermission(req.user, "merchandise_entry", "create") ||
    hasPermission(req.user, "merchandise_exit", "create")
  ) {
    return;
  }
  throw new AppError("Perfil sem permissão para cadastrar produtos.", 403);
}

function assertOperator(req) {
  if (
    hasPermission(req.user, "merchandise_entry", "create") ||
    hasPermission(req.user, "merchandise_exit", "create")
  ) {
    return;
  }
  throw new AppError("Perfil sem permissão para operações de mercadorias.", 403);
}

function assertMovementCatalogAccess(req) {
  if (
    hasPermission(req.user, "merchandise_entry", "view") ||
    hasPermission(req.user, "merchandise_exit", "view") ||
    hasPermission(req.user, "merchandise_entry", "create") ||
    hasPermission(req.user, "merchandise_exit", "create")
  ) {
    return;
  }
  throw new AppError("Perfil sem permissão para consultar catálogos de mercadorias.", 403);
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
  assertProductCreateAccess(req);
  const manufacturer = data.manufacturer?.trim() || null;
  const description = data.description.trim();
  const [dup] = await db.execute(
    `SELECT id_product FROM product WHERE LOWER(description) = LOWER(?) LIMIT 1`,
    [description],
  );
  if (dup.length) {
    throw new AppError("Já existe um produto com esta descrição.", 409);
  }
  const [result] = await db.execute(
    `INSERT INTO product (description, unit_measure, manufacturer, status) VALUES (?, ?, ?, 1)`,
    [description, data.unit_measure.trim(), manufacturer],
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
  assertMovementCatalogAccess(req);
  const [rows] = await db.execute(
    `SELECT id_storage_location, name, type, status FROM storage_location WHERE status = 1 ORDER BY name ASC`,
  );
  return { locations: rows.map(mapLocation) };
}

async function listProductsForSelect(req) {
  assertMovementCatalogAccess(req);
  const [rows] = await db.execute(
    `SELECT id_product, description, unit_measure, manufacturer, status FROM product WHERE status = 1 ORDER BY description ASC`,
  );
  return { products: rows.map(mapProduct) };
}

async function listCompaniesForSelect(req) {
  assertMovementCatalogAccess(req);
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
  assertMovementCatalogAccess(req);
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
    `SELECT id_product, description FROM product WHERE id_product = ? AND status = 1 LIMIT 1`,
    [idProduct],
  );
  if (rows.length === 0) throw new AppError(`Produto #${idProduct} inválido ou inativo.`, 400);
  return { id_product: rows[0].id_product, description: rows[0].description };
}

async function assertActiveLocation(idLocation) {
  const [rows] = await db.execute(
    `SELECT id_storage_location, name FROM storage_location WHERE id_storage_location = ? AND status = 1 LIMIT 1`,
    [idLocation],
  );
  if (rows.length === 0) {
    throw new AppError(`Local #${idLocation} inválido ou inativo.`, 400);
  }
  return { id_storage_location: rows[0].id_storage_location, name: rows[0].name };
}

async function assertNotBlocked(conn, { collaboratorIds = [], document = null, plate = null, idVehicle = null } = {}) {
  const exec = conn && typeof conn.execute === "function" ? conn : db;
  const ids = [...new Set((collaboratorIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0))];

  if (document) {
    const digits = String(document).replace(/\D/g, "");
    if (digits) {
      const [found] = await exec.execute(
        `SELECT id_collaborator FROM collaborator
         WHERE document = ? OR REPLACE(REPLACE(REPLACE(document, '.', ''), '-', ''), '/', '') = ?
         LIMIT 20`,
        [String(document).trim(), digits],
      );
      for (const row of found) ids.push(Number(row.id_collaborator));
    }
  }

  const uniqueIds = [...new Set(ids)];
  for (const id of uniqueIds) {
    const info = await getActiveBlock(id);
    if (!info) continue;
    const [nameRows] = await exec.execute(
      `SELECT name FROM collaborator WHERE id_collaborator = ? LIMIT 1`,
      [id],
    );
    const name = nameRows[0]?.name || `#${id}`;
    throw new AppError(
      `"${name}" está impedido de acessar a arena.${info.reason ? ` Motivo: ${info.reason}.` : ""}`,
      403,
      true,
      {
        reason: info.reason || info.blocklist_reason || null,
        id_collaborator: id,
      },
      BLOCKLIST_ERROR_CODE,
    );
  }

  if (idVehicle) {
    const [blockedVeh] = await exec.execute(
      `SELECT v.plate FROM vehicle v
       INNER JOIN vehicle_block_list vbl ON vbl.id_vehicle = v.id_vehicle
       WHERE v.id_vehicle = ?
       LIMIT 1`,
      [idVehicle],
    );
    if (blockedVeh.length) {
      throw new AppError(`Veículo ${blockedVeh[0].plate} está na lista de restrição.`, 403);
    }
  }

  if (plate) {
    const normalized = normalizePlate(plate);
    if (normalized) {
      const [blockedPlate] = await exec.execute(
        `SELECT v.plate FROM vehicle v
         INNER JOIN vehicle_block_list vbl ON vbl.id_vehicle = v.id_vehicle
         WHERE v.plate = ?
         LIMIT 1`,
        [normalized],
      );
      if (blockedPlate.length) {
        throw new AppError(`Veículo ${blockedPlate[0].plate} está na lista de restrição.`, 403);
      }
    }
  }
}

/**
 * Aplica o efeito da movimentação no saldo materializado.
 * Em SAIDA, o UPDATE condicional valida de forma atômica (lock da PK).
 */
async function applyStockBalance(conn, movementType, items) {
  const ordered = [...items].sort(
    (a, b) => a.id_product - b.id_product || a.id_storage_location - b.id_storage_location,
  );

  for (const item of ordered) {
    if (movementType === "ENTRADA") {
      await conn.execute(
        `INSERT INTO material_stock_balance (id_product, id_storage_location, balance)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
        [item.id_product, item.id_storage_location, item.quantity],
      );
    } else {
      const [res] = await conn.execute(
        `UPDATE material_stock_balance
            SET balance = balance - ?
          WHERE id_product = ?
            AND id_storage_location = ?
            AND balance >= ?`,
        [item.quantity, item.id_product, item.id_storage_location, item.quantity],
      );
      if (!res.affectedRows) {
        throw new AppError(
          `Saldo insuficiente para "${item.product_name}" em "${item.location_name}".`,
          400,
        );
      }
    }
  }
}

function assertExternalCompaniesView(req) {
  assertPermission(req.user, "merchandise_external_companies", "view");
}

function assertExternalCompaniesEdit(req) {
  assertPermission(req.user, "merchandise_external_companies", "edit");
}

async function getVehiclePlate(idVehicle) {
  const [rows] = await db.execute(
    `SELECT plate FROM vehicle WHERE id_vehicle = ? LIMIT 1`,
    [idVehicle],
  );
  return rows[0]?.plate || null;
}

function splitSenderDocument(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 14 && isValidCnpj(digits)) {
    return { cnpj: normalizeCnpj(digits), cpf: null };
  }
  if (digits.length === 11 && isValidCpf(digits)) {
    return { cnpj: null, cpf: normalizeCpf(digits) };
  }
  return { cnpj: null, cpf: null };
}

/**
 * Identidade eventual: só persiste se o documento passar no DV.
 * LAST_INSERT_ID(id) no UPDATE faz insertId valer também no upsert.
 */
async function resolveExternalCompany(conn, payload) {
  const cnpj = payload.cnpj && isValidCnpj(payload.cnpj) ? normalizeCnpj(payload.cnpj) : null;
  const cpf = !cnpj && payload.cpf && isValidCpf(payload.cpf) ? normalizeCpf(payload.cpf) : null;
  if (!cnpj && !cpf) return { id_external_company: null, id_company: null };

  let linkedCompanyId = null;
  if (cnpj) {
    const [rows] = await conn.execute(
      `SELECT id_company FROM company
        WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') = ?
        LIMIT 1`,
      [cnpj],
    );
    linkedCompanyId = rows[0]?.id_company ?? null;
  }

  const legalName = String(payload.legal_name || "").trim().slice(0, 160) || "(não identificado)";
  const [res] = await conn.execute(
    `INSERT INTO external_company
       (cnpj, cpf, legal_name, trade_name, ie, uf, municipio, cep, endereco,
        origem, id_company, primeira_entrada, ultima_entrada, total_movimentos)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),1)
     ON DUPLICATE KEY UPDATE
       legal_name = IF(revisado = 1, legal_name, COALESCE(VALUES(legal_name), legal_name)),
       trade_name = IF(revisado = 1, trade_name, COALESCE(VALUES(trade_name), trade_name)),
       ie         = COALESCE(ie, VALUES(ie)),
       uf         = COALESCE(uf, VALUES(uf)),
       municipio  = COALESCE(municipio, VALUES(municipio)),
       cep        = COALESCE(cep, VALUES(cep)),
       endereco   = COALESCE(endereco, VALUES(endereco)),
       id_company = COALESCE(VALUES(id_company), id_company),
       ultima_entrada   = NOW(),
       total_movimentos = total_movimentos + 1,
       id_external_company = LAST_INSERT_ID(id_external_company)`,
    [
      cnpj,
      cpf,
      legalName,
      payload.trade_name || null,
      payload.ie || null,
      payload.uf || null,
      payload.municipio || null,
      payload.cep || null,
      payload.endereco || null,
      payload.origem || "MANUAL",
      linkedCompanyId,
    ],
  );

  return { id_external_company: res.insertId, id_company: linkedCompanyId };
}

/**
 * usado só em relatório/reconciliação;
 * NÃO valida saída — quem valida é applyStockBalance
 */
async function getStockBalance(conn, idProduct, idStorageLocation) {
  const [rows] = await conn.execute(
    `SELECT COALESCE(SUM(
       CASE mm.movement_type WHEN 'ENTRADA' THEN mmi.quantity ELSE -mmi.quantity END
     ), 0) AS balance
     FROM material_movement_item mmi
     INNER JOIN material_movement mm ON mm.id_material_movement = mmi.id_material_movement
     WHERE mmi.id_product = ? AND mmi.id_storage_location = ?
       AND mm.movement_nature = 'ESTOQUE'`,
    [idProduct, idStorageLocation],
  );
  return Number(rows[0]?.balance ?? 0);
}

function saveMovementPhoto(file) {
  if (!file?.buffer?.length) return null;
  fs.mkdirSync(MERCHANDISE_STORAGE_DIR, { recursive: true });
  const ext = path.extname(file.originalname || ".jpg").toLowerCase() || ".jpg";
  const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
  const filename = `${crypto.randomUUID()}${safeExt}`;
  fs.writeFileSync(path.join(MERCHANDISE_STORAGE_DIR, filename), file.buffer);
  return {
    filename,
    original_name: String(file.originalname || "").slice(0, 255) || null,
  };
}

function normalizeMovementFiles(fileOrFiles) {
  if (!fileOrFiles) return [];
  const list = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  return list.filter((f) => f?.buffer?.length);
}

function unlinkMovementPhotos(saved) {
  for (const item of saved || []) {
    const name = typeof item === "string" ? item : item?.filename;
    if (!name) continue;
    try {
      fs.unlinkSync(path.join(MERCHANDISE_STORAGE_DIR, name));
    } catch {
      /* ignore */
    }
  }
}

async function unlinkUnreferencedMovementPhotos(saved) {
  const names = (saved || [])
    .map((item) => (typeof item === "string" ? item : item?.filename))
    .filter(Boolean);
  if (!names.length) return;

  let referenced = new Set();
  try {
    const ph = names.map(() => "?").join(",");
    const [rows] = await db.execute(
      `SELECT filename FROM material_movement_photo WHERE filename IN (${ph})
       UNION
       SELECT photo AS filename FROM material_movement
        WHERE photo IS NOT NULL AND photo IN (${ph})`,
      [...names, ...names],
    );
    referenced = new Set(rows.map((r) => r.filename).filter(Boolean));
  } catch {
    /* tabela/coluna pode faltar em ambiente antigo */
  }

  unlinkMovementPhotos(names.filter((name) => !referenced.has(name)));
}

function isRequestIdDuplicate(err) {
  if (err?.code !== "ER_DUP_ENTRY") return false;
  return /uq_mm_request_id/i.test(String(err.sqlMessage || err.message || ""));
}

async function loadMovementHeaderById(id) {
  const [rows] = await db.execute(
    `SELECT mm.*,
            COALESCE(c.fancy_name, c.company_name, mm.sender_name) AS origem_nome,
            c.fancy_name AS company_fancy_name, c.company_name,
            COALESCE(col.name, mm.driver_name) AS collaborator_name,
            COALESCE(v.plate, mm.vehicle_plate) AS vehicle_plate
     FROM material_movement mm
     LEFT JOIN company c ON c.id_company = mm.id_company
     LEFT JOIN collaborator col ON col.id_collaborator = mm.id_collaborator
     LEFT JOIN vehicle v ON v.id_vehicle = mm.id_vehicle
     WHERE mm.id_material_movement = ?`,
    [id],
  );
  if (!rows.length) return null;
  return mapMovementRow(rows[0]);
}

async function findMovementByRequestId(requestId) {
  if (!requestId) return null;
  const [rows] = await db.execute(
    `SELECT id_material_movement FROM material_movement WHERE request_id = ? LIMIT 1`,
    [requestId],
  );
  if (!rows.length) return null;
  return loadMovementHeaderById(rows[0].id_material_movement);
}

async function loadMovementPhotos(idMovement) {
  try {
    const [rows] = await db.execute(
      `SELECT id_material_movement_photo, filename, original_name, sort_order, criado_em
       FROM material_movement_photo
       WHERE id_material_movement = ?
       ORDER BY sort_order ASC, id_material_movement_photo ASC`,
      [idMovement],
    );
    return rows.map((r) => ({
      id_material_movement_photo: r.id_material_movement_photo,
      filename: r.filename,
      original_name: r.original_name || null,
      sort_order: Number(r.sort_order) || 0,
      criado_em: r.criado_em,
    }));
  } catch {
    // Tabela ainda não migrada: fallback pela coluna legado.
    return [];
  }
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

async function loadMovementCollaborators(idMovement) {
  const [rows] = await db.execute(
    `SELECT mmc.id_collaborator, mmc.role, col.name, col.document
     FROM material_movement_collaborator mmc
     INNER JOIN collaborator col ON col.id_collaborator = mmc.id_collaborator
     WHERE mmc.id_material_movement = ?
     ORDER BY CASE mmc.role WHEN 'MOTORISTA' THEN 0 ELSE 1 END,
              mmc.id_material_movement_collaborator ASC`,
    [idMovement],
  );
  return rows.map((r) => ({
    id_collaborator: Number(r.id_collaborator),
    role: r.role,
    name: r.name,
    document: r.document,
  }));
}

async function mapMovementRow(row) {
  const items = await loadMovementItems(row.id_material_movement);
  let collaborators = [];
  try {
    collaborators = await loadMovementCollaborators(row.id_material_movement);
  } catch {
    collaborators = [];
  }
  if (!collaborators.length && row.id_collaborator) {
    collaborators = [
      {
        id_collaborator: Number(row.id_collaborator),
        role: "MOTORISTA",
        name: row.collaborator_name,
        document: null,
      },
    ];
  }
  let photos = await loadMovementPhotos(row.id_material_movement);
  if (!photos.length && row.photo) {
    photos = [
      {
        id_material_movement_photo: null,
        filename: row.photo,
        original_name: null,
        sort_order: 0,
        criado_em: row.criado_em,
      },
    ];
  }
  return {
    id_material_movement: row.id_material_movement,
    movement_type: row.movement_type,
    movement_nature: row.movement_nature || "ESTOQUE",
    origin_type: row.origin_type || "CREDENCIADA",
    origem_nome:
      row.origem_nome ||
      row.company_fancy_name ||
      row.company_name ||
      row.sender_name ||
      null,
    id_company: row.id_company,
    id_external_company: row.id_external_company || null,
    company_fancy_name:
      row.company_fancy_name || row.company_name || row.sender_name || null,
    invoice_number: row.invoice_number,
    no_invoice_reason: row.no_invoice_reason || null,
    id_collaborator: row.id_collaborator,
    collaborator_name: row.collaborator_name || row.driver_name || null,
    collaborators,
    id_vehicle: row.id_vehicle,
    vehicle_plate: row.vehicle_plate,
    sender_name: row.sender_name || null,
    sender_document: row.sender_document || null,
    carrier_name: row.carrier_name || null,
    driver_name: row.driver_name || null,
    driver_document: row.driver_document || null,
    volumes: row.volumes != null ? Number(row.volumes) : null,
    content_description: row.content_description || null,
    id_recipient_collaborator: row.id_recipient_collaborator || null,
    recipient_area: row.recipient_area || null,
    photo: photos[0]?.filename || row.photo || null,
    photos,
    criado_em: row.criado_em,
    items,
  };
}

async function createMovement(req, movementType, payload, fileOrFiles) {
  assertOperator(req);

  if (payload.request_id) {
    const existing = await findMovementByRequestId(payload.request_id);
    if (existing) return { movement: existing, replayed: true };
  }

  const origin = payload.origin_type || "CREDENCIADA";
  const nature = payload.movement_nature || "ESTOQUE";

  let companyId = null;
  let vehicleId = null;
  let collaboratorIds = [];
  const snapshot = {
    sender_name: null,
    sender_document: null,
    carrier_name: null,
    driver_name: null,
    driver_document: null,
    vehicle_plate: null,
  };

  if (origin === "CREDENCIADA") {
    await assertCompanyExists(payload.id_company);
    collaboratorIds = Array.isArray(payload.id_collaborators)
      ? [...new Set(payload.id_collaborators.map(Number))]
      : [Number(payload.id_collaborator)];
    if (!collaboratorIds.length) {
      throw new AppError("Informe ao menos um colaborador na relação (motorista).", 400);
    }
    for (const id of collaboratorIds) {
      await assertCollaboratorExists(id);
    }
    await assertVehicleForCompany(payload.id_vehicle, payload.id_company);
    snapshot.vehicle_plate = await getVehiclePlate(payload.id_vehicle);
    await assertNotBlocked(null, {
      collaboratorIds,
      idVehicle: payload.id_vehicle,
    });
    companyId = payload.id_company;
    vehicleId = payload.id_vehicle;
  } else {
    snapshot.sender_name = payload.sender_name;
    snapshot.sender_document = payload.sender_document || null;
    snapshot.carrier_name = payload.carrier_name || null;
    snapshot.driver_name = payload.driver_name;
    snapshot.driver_document = payload.driver_document;
    snapshot.vehicle_plate = payload.vehicle_plate;
    await assertNotBlocked(null, {
      document: snapshot.driver_document,
      plate: snapshot.vehicle_plate,
    });
  }

  if (payload.id_recipient_collaborator) {
    await assertCollaboratorExists(payload.id_recipient_collaborator);
  }

  const catalogItems = [];
  if (nature === "ESTOQUE") {
    for (const item of payload.items || []) {
      const product = await assertActiveProduct(item.id_product);
      const location = await assertActiveLocation(item.id_storage_location);
      catalogItems.push({
        id_product: item.id_product,
        id_storage_location: item.id_storage_location,
        quantity: item.quantity,
        product_name: product.description,
        location_name: location.name,
      });
    }
  }

  const primaryCollaboratorId = collaboratorIds[0] || null;
  const incomingFiles = normalizeMovementFiles(fileOrFiles);
  const savedPhotos = [];
  for (const file of incomingFiles) {
    const saved = saveMovementPhoto(file);
    if (saved) savedPhotos.push(saved);
  }
  const photoFilename = savedPhotos[0]?.filename || null;
  const idUsuario = req.user?.id ?? req.user?.id_usuario ?? null;
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    let externalId = null;
    if (origin === "EVENTUAL") {
      const docs = splitSenderDocument(payload.sender_document);
      const resolved = await resolveExternalCompany(conn, {
        cnpj: docs.cnpj,
        cpf: docs.cpf,
        legal_name: payload.sender_name,
        trade_name: payload.trade_name,
        ie: payload.ie,
        uf: payload.uf,
        municipio: payload.municipio,
        cep: payload.cep ? String(payload.cep).replace(/\D/g, "").slice(0, 8) : null,
        endereco: payload.endereco,
        origem: payload.external_origem || "MANUAL",
      });
      externalId = resolved.id_external_company;
    }

    const [result] = await conn.execute(
      `INSERT INTO material_movement
       (movement_type, movement_nature, origin_type, id_company, id_external_company,
        invoice_number, no_invoice_reason,
        id_collaborator, id_vehicle, photo, id_usuario, request_id,
        sender_name, sender_document, carrier_name, driver_name, driver_document, vehicle_plate,
        volumes, content_description, id_recipient_collaborator, recipient_area)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movementType,
        nature,
        origin,
        companyId,
        externalId,
        payload.invoice_number || null,
        payload.no_invoice_reason || null,
        primaryCollaboratorId,
        vehicleId,
        photoFilename,
        idUsuario,
        payload.request_id || null,
        snapshot.sender_name,
        snapshot.sender_document,
        snapshot.carrier_name,
        snapshot.driver_name,
        snapshot.driver_document,
        snapshot.vehicle_plate,
        payload.volumes || null,
        payload.content_description || null,
        payload.id_recipient_collaborator || null,
        payload.recipient_area || null,
      ],
    );

    if (origin === "CREDENCIADA") {
      for (let i = 0; i < collaboratorIds.length; i += 1) {
        await conn.execute(
          `INSERT INTO material_movement_collaborator
           (id_material_movement, id_collaborator, role)
           VALUES (?, ?, ?)`,
          [result.insertId, collaboratorIds[i], i === 0 ? "MOTORISTA" : "AJUDANTE"],
        );
      }
    }

    if (nature === "ESTOQUE") {
      for (const item of catalogItems) {
        await conn.execute(
          `INSERT INTO material_movement_item
           (id_material_movement, id_product, id_storage_location, quantity)
           VALUES (?, ?, ?, ?)`,
          [result.insertId, item.id_product, item.id_storage_location, item.quantity],
        );
      }
    }

    for (let i = 0; i < savedPhotos.length; i += 1) {
      const p = savedPhotos[i];
      try {
        await conn.execute(
          `INSERT INTO material_movement_photo
           (id_material_movement, filename, original_name, sort_order)
           VALUES (?, ?, ?, ?)`,
          [result.insertId, p.filename, p.original_name, i],
        );
      } catch (err) {
        const missingTable =
          err?.code === "ER_NO_SUCH_TABLE" || /material_movement_photo/i.test(String(err?.message || ""));
        if (missingTable) break;
        throw err;
      }
    }

    if (nature === "ESTOQUE") {
      await applyStockBalance(conn, movementType, catalogItems);
    }
    await conn.commit();

    const movement = await loadMovementHeaderById(result.insertId);
    return { movement, replayed: false };
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    if (isRequestIdDuplicate(err) && payload.request_id) {
      await unlinkUnreferencedMovementPhotos(savedPhotos);
      const existing = await findMovementByRequestId(payload.request_id);
      if (existing) return { movement: existing, replayed: true };
    }
    await unlinkUnreferencedMovementPhotos(savedPhotos);
    throw err;
  } finally {
    conn.release();
  }
}

async function getStock(req) {
  assertReportsView(req);
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
     WHERE mm.movement_nature = 'ESTOQUE'
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
  assertReportsView(req);
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
    `SELECT mm.*,
            COALESCE(c.fancy_name, c.company_name, mm.sender_name) AS origem_nome,
            c.fancy_name AS company_fancy_name, c.company_name,
            COALESCE(col.name, mm.driver_name) AS collaborator_name,
            COALESCE(v.plate, mm.vehicle_plate) AS vehicle_plate
     FROM material_movement mm
     LEFT JOIN company c ON c.id_company = mm.id_company
     LEFT JOIN collaborator col ON col.id_collaborator = mm.id_collaborator
     LEFT JOIN vehicle v ON v.id_vehicle = mm.id_vehicle
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
  assertReportsView(req);

  const [seriesRows] = await db.execute(
    `SELECT DATE(mm.criado_em) AS day,
            mm.movement_type,
            COUNT(*) AS movement_count
     FROM material_movement mm
     WHERE mm.criado_em >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       AND mm.movement_nature = 'ESTOQUE'
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
       AND movement_nature = 'ESTOQUE'
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

async function getStockReconcile(req) {
  assertReportsView(req);
  const derivedSql = `
    SELECT
      mmi.id_product,
      mmi.id_storage_location,
      COALESCE(SUM(
        CASE mm.movement_type WHEN 'ENTRADA' THEN mmi.quantity ELSE -mmi.quantity END
      ), 0) AS derived_balance
    FROM material_movement_item mmi
    INNER JOIN material_movement mm ON mm.id_material_movement = mmi.id_material_movement
    WHERE mm.movement_nature = 'ESTOQUE'
    GROUP BY mmi.id_product, mmi.id_storage_location
  `;
  const [rows] = await db.execute(
    `SELECT
       COALESCE(b.id_product, d.id_product) AS id_product,
       p.description AS product_description,
       COALESCE(b.id_storage_location, d.id_storage_location) AS id_storage_location,
       sl.name AS location_name,
       COALESCE(b.balance, 0) AS materialized,
       COALESCE(d.derived_balance, 0) AS derived
     FROM material_stock_balance b
     LEFT JOIN (${derivedSql}) d
       ON d.id_product = b.id_product AND d.id_storage_location = b.id_storage_location
     LEFT JOIN product p ON p.id_product = COALESCE(b.id_product, d.id_product)
     LEFT JOIN storage_location sl
       ON sl.id_storage_location = COALESCE(b.id_storage_location, d.id_storage_location)
     UNION
     SELECT
       d.id_product,
       p.description,
       d.id_storage_location,
       sl.name,
       COALESCE(b.balance, 0),
       d.derived_balance
     FROM (${derivedSql}) d
     LEFT JOIN material_stock_balance b
       ON b.id_product = d.id_product AND b.id_storage_location = d.id_storage_location
     LEFT JOIN product p ON p.id_product = d.id_product
     LEFT JOIN storage_location sl ON sl.id_storage_location = d.id_storage_location
     WHERE b.id_product IS NULL`,
  );

  const divergences = rows
    .filter((r) => Number(r.materialized) !== Number(r.derived))
    .map((r) => ({
      id_product: r.id_product,
      product_description: r.product_description,
      id_storage_location: r.id_storage_location,
      location_name: r.location_name,
      materialized: Number(r.materialized),
      derived: Number(r.derived),
    }));

  return { divergences };
}

async function lookupPlate(req, rawPlate) {
  assertMovementCatalogAccess(req);
  const plate = normalizePlate(rawPlate);
  if (!isValidPlate(plate)) return { found: false };

  const [fleet] = await db.execute(
    `SELECT v.id_vehicle, v.plate, c.id_company,
            COALESCE(c.fancy_name, c.company_name) AS company_name
       FROM vehicle v
       INNER JOIN company c ON c.id_company = v.id_company
      WHERE v.plate = ? AND v.status = 1
      LIMIT 1`,
    [plate],
  );
  if (fleet.length) {
    return { found: true, origin_type: "CREDENCIADA", vehicle: fleet[0] };
  }

  const [hist] = await db.execute(
    `SELECT sender_name, sender_document, carrier_name,
            driver_name, driver_document, vehicle_plate, movement_nature, criado_em
       FROM material_movement
      WHERE vehicle_plate = ? AND origin_type = 'EVENTUAL'
      ORDER BY criado_em DESC
      LIMIT 1`,
    [plate],
  );
  if (hist.length) {
    return { found: true, origin_type: "EVENTUAL", suggestion: hist[0] };
  }

  return { found: false, origin_type: "EVENTUAL", suggestion: { vehicle_plate: plate } };
}

function mapExternalCompany(row) {
  if (!row) return null;
  return {
    id_external_company: row.id_external_company,
    cnpj: row.cnpj || null,
    cpf: row.cpf || null,
    legal_name: row.legal_name,
    trade_name: row.trade_name || null,
    ie: row.ie || null,
    uf: row.uf || null,
    municipio: row.municipio || null,
    cep: row.cep || null,
    endereco: row.endereco || null,
    origem: row.origem,
    revisado: !!row.revisado,
    id_company: row.id_company || null,
    primeira_entrada: row.primeira_entrada,
    ultima_entrada: row.ultima_entrada,
    total_movimentos: Number(row.total_movimentos || 0),
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

async function suggestExternalCompanies(req, q) {
  assertMovementCatalogAccess(req);
  const term = String(q || "").trim();
  if (term.length < 2) return { companies: [] };
  const like = `%${term}%`;
  const digits = term.replace(/\D/g, "");
  const [rows] = await db.execute(
    `SELECT * FROM external_company
      WHERE legal_name LIKE ? OR trade_name LIKE ?
         OR (? <> '' AND (cnpj LIKE ? OR cpf LIKE ?))
      ORDER BY total_movimentos DESC, legal_name ASC
      LIMIT 20`,
    [like, like, digits, `${digits}%`, `${digits}%`],
  );
  return { companies: rows.map(mapExternalCompany) };
}

async function listExternalCompanies(req, query) {
  assertExternalCompaniesView(req);
  const conditions = ["1=1"];
  const params = [];
  if (query.revisado === 0 || query.revisado === 1) {
    conditions.push("revisado = ?");
    params.push(query.revisado);
  }
  const term = String(query.q || "").trim();
  if (term.length >= 2) {
    const like = `%${term}%`;
    const digits = term.replace(/\D/g, "");
    conditions.push("(legal_name LIKE ? OR trade_name LIKE ? OR cnpj LIKE ? OR cpf LIKE ?)");
    params.push(like, like, `${digits}%`, `${digits}%`);
  }
  const [rows] = await db.execute(
    `SELECT * FROM external_company
      WHERE ${conditions.join(" AND ")}
      ORDER BY total_movimentos DESC, ultima_entrada DESC, legal_name ASC
      LIMIT 200`,
    params,
  );
  return { companies: rows.map(mapExternalCompany) };
}

async function lookupExternalCompanyByDocument(cnpj, cpf) {
  if (cnpj && isValidCnpj(cnpj)) {
    const [rows] = await db.execute(
      `SELECT * FROM external_company WHERE cnpj = ? LIMIT 1`,
      [normalizeCnpj(cnpj)],
    );
    return rows[0] ? mapExternalCompany(rows[0]) : null;
  }
  if (cpf && isValidCpf(cpf)) {
    const [rows] = await db.execute(
      `SELECT * FROM external_company WHERE cpf = ? LIMIT 1`,
      [normalizeCpf(cpf)],
    );
    return rows[0] ? mapExternalCompany(rows[0]) : null;
  }
  return null;
}

async function patchExternalCompany(req, id, data) {
  assertExternalCompaniesEdit(req);
  const [existing] = await db.execute(
    `SELECT * FROM external_company WHERE id_external_company = ? LIMIT 1`,
    [id],
  );
  if (!existing.length) throw new AppError("Empresa eventual não encontrada.", 404);

  const fields = [];
  const params = [];
  if (data.legal_name != null) {
    fields.push("legal_name = ?");
    params.push(data.legal_name);
  }
  if (data.trade_name !== undefined) {
    fields.push("trade_name = ?");
    params.push(data.trade_name || null);
  }
  if (data.ie !== undefined) {
    fields.push("ie = ?");
    params.push(data.ie || null);
  }
  if (data.uf !== undefined) {
    fields.push("uf = ?");
    params.push(data.uf || null);
  }
  if (data.municipio !== undefined) {
    fields.push("municipio = ?");
    params.push(data.municipio || null);
  }
  if (data.cep !== undefined) {
    fields.push("cep = ?");
    params.push(data.cep ? String(data.cep).replace(/\D/g, "").slice(0, 8) : null);
  }
  if (data.endereco !== undefined) {
    fields.push("endereco = ?");
    params.push(data.endereco || null);
  }
  fields.push("revisado = ?");
  params.push(data.revisado === false ? 0 : 1);
  params.push(id);
  await db.execute(
    `UPDATE external_company SET ${fields.join(", ")} WHERE id_external_company = ?`,
    params,
  );
  const [rows] = await db.execute(
    `SELECT * FROM external_company WHERE id_external_company = ? LIMIT 1`,
    [id],
  );
  return mapExternalCompany(rows[0]);
}

async function mergeExternalCompanies(req, idSource, idTarget) {
  assertExternalCompaniesEdit(req);
  const sourceId = Number(idSource);
  const targetId = Number(idTarget);
  if (!sourceId || !targetId || sourceId === targetId) {
    throw new AppError("Informe um destino diferente da origem.", 400);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [srcRows] = await conn.execute(
      `SELECT id_external_company FROM external_company WHERE id_external_company = ? LIMIT 1`,
      [sourceId],
    );
    const [tgtRows] = await conn.execute(
      `SELECT id_external_company FROM external_company WHERE id_external_company = ? LIMIT 1`,
      [targetId],
    );
    if (!srcRows.length || !tgtRows.length) {
      throw new AppError("Empresa eventual não encontrada.", 404);
    }

    await conn.execute(
      `UPDATE material_movement SET id_external_company = ? WHERE id_external_company = ?`,
      [targetId, sourceId],
    );

    const [agg] = await conn.execute(
      `SELECT COUNT(*) AS total, MIN(criado_em) AS primeira, MAX(criado_em) AS ultima
         FROM material_movement WHERE id_external_company = ?`,
      [targetId],
    );
    await conn.execute(
      `UPDATE external_company
          SET total_movimentos = ?,
              primeira_entrada = COALESCE(?, primeira_entrada),
              ultima_entrada = COALESCE(?, ultima_entrada)
        WHERE id_external_company = ?`,
      [Number(agg[0]?.total || 0), agg[0]?.primeira || null, agg[0]?.ultima || null, targetId],
    );

    await conn.execute(`DELETE FROM external_company WHERE id_external_company = ?`, [sourceId]);
    await conn.commit();

    const [rows] = await db.execute(
      `SELECT * FROM external_company WHERE id_external_company = ? LIMIT 1`,
      [targetId],
    );
    return mapExternalCompany(rows[0]);
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    conn.release();
  }
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
  lookupPlate,
  suggestExternalCompanies,
  listExternalCompanies,
  lookupExternalCompanyByDocument,
  patchExternalCompany,
  mergeExternalCompanies,
  getStock,
  getStockReconcile,
  getHistory,
  getDashboard,
};
