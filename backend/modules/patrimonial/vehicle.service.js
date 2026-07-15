const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { normalizePlate, isValidPlate } = require("../../utils/plate");
const { hasPermission } = require("../../utils/permissions");
const { savePreviewSession, getPreviewSession, deletePreviewSession } = require("../bulk/previewSession");
const { buildFieldDiffs, pickUpdatePatch, summarizePreviewRows } = require("../bulk/diff");
const {
  parseBulkFile,
  normalizeFleetVehicleBulkRow,
  isEmptyFleetVehicleBulkRow,
} = require("./vehicle.bulk");

const VEHICLE_BULK_UPDATE_FIELDS = ["brand", "model", "color", "type", "description"];

const VEHICLE_SELECT = `
  SELECT v.*, c.fancy_name AS company_fancy_name, c.company_name,
         vbl.reason AS blacklist_reason
  FROM vehicle v
  INNER JOIN company c ON c.id_company = v.id_company
  LEFT JOIN vehicle_black_list vbl ON vbl.id_vehicle = v.id_vehicle
`;

const { buildCompanyScope, applyScopeToWhere } = require("../companies/company.service");

function assertCanManageVehicles(req) {
  if (!hasPermission(req.user, "fleet", "view")) {
    throw new AppError("Perfil sem permissão para gerenciar veículos.", 403);
  }
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

function mapVehicleRow(row, { canDelete = false } = {}) {
  return {
    id_vehicle: row.id_vehicle,
    id_company: row.id_company,
    plate: row.plate,
    brand: row.brand || null,
    model: row.model || null,
    color: row.color || null,
    type: row.type || null,
    description: row.description || null,
    status: !!row.status,
    is_blacklisted: !!row.blacklist_reason,
    blacklist_reason: row.blacklist_reason || null,
    can_delete: !!canDelete,
    company_fancy_name: row.company_fancy_name || row.company_name,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

async function checkVehicleBlacklist(idVehicle) {
  const [rows] = await db.execute(
    "SELECT 1 FROM vehicle_black_list WHERE id_vehicle = ? LIMIT 1",
    [idVehicle],
  );
  return rows.length > 0;
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
  if (filters.q) {
    const raw = String(filters.q).trim();
    const plateTerm = `%${normalizePlate(raw)}%`;
    const term = `%${raw}%`;
    extra.push(
      "(v.plate LIKE ? OR v.brand LIKE ? OR v.model LIKE ? OR v.description LIKE ?)",
    );
    extraParams.push(plateTerm, term, term, term);
  }
  if (filters.brand) {
    const term = `%${String(filters.brand).trim()}%`;
    extra.push("(v.brand LIKE ? OR v.model LIKE ?)");
    extraParams.push(term, term);
  }
  if (filters.id_company) {
    extra.push("v.id_company = ?");
    extraParams.push(filters.id_company);
  }
  if (filters.type) {
    extra.push("v.type LIKE ?");
    extraParams.push(`%${String(filters.type).trim()}%`);
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
    vehicles: await Promise.all(
      rows.map(async (row) => {
        const usageCount = await countVehicleUsage(row.id_vehicle);
        return mapVehicleRow(row, { canDelete: usageCount === 0 });
      }),
    ),
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
    `INSERT INTO vehicle (id_company, plate, brand, model, color, type, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      idCompany,
      plate,
      data.brand || null,
      data.model || null,
      data.color || null,
      data.type || null,
      data.description || null,
      data.status !== false ? 1 : 0,
    ],
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

  const brand = data.brand !== undefined ? data.brand || null : existing.brand;
  const model = data.model !== undefined ? data.model || null : existing.model;
  const color = data.color !== undefined ? data.color || null : existing.color;
  const type = data.type !== undefined ? data.type || null : existing.type;
  const description = data.description !== undefined ? data.description || null : existing.description;
  const status = data.status !== undefined ? (data.status ? 1 : 0) : existing.status ? 1 : 0;

  await db.execute(
    `UPDATE vehicle SET plate = ?, brand = ?, model = ?, color = ?, type = ?, description = ?, status = ? WHERE id_vehicle = ?`,
    [plate, brand, model, color, type, description, status, id],
  );

  return getVehicleById(req, id);
}

async function applyVehicleFieldPatch(id, data) {
  const existing = await findVehicleById(id);
  if (!existing) throw new AppError("Veículo não encontrado.", 404);

  const brand = data.brand !== undefined ? data.brand || null : existing.brand;
  const model = data.model !== undefined ? data.model || null : existing.model;
  const color = data.color !== undefined ? data.color || null : existing.color;
  const type = data.type !== undefined ? data.type || null : existing.type;
  const description = data.description !== undefined ? data.description || null : existing.description;

  await db.execute(
    `UPDATE vehicle SET brand = ?, model = ?, color = ?, type = ?, description = ? WHERE id_vehicle = ?`,
    [brand, model, color, type, description, id],
  );

  return findVehicleById(id);
}

async function findVehicleById(id) {
  const [rows] = await db.execute(`${VEHICLE_SELECT} WHERE v.id_vehicle = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function addToBlacklist(req, id, reason) {
  assertCanManageVehicles(req);
  const [rows] = await db.execute(`${VEHICLE_SELECT} WHERE v.id_vehicle = ? LIMIT 1`, [id]);
  if (!rows[0]) throw new AppError("Veículo não encontrado.", 404);
  await assertVehicleInScope(req, rows[0]);

  if (rows[0].blacklist_reason) {
    throw new AppError("Veículo já está na blacklist frota.", 409);
  }

  await db.execute(
    `INSERT INTO vehicle_black_list (id_vehicle, reason, id_usuario) VALUES (?, ?, ?)`,
    [id, reason, req.user?.id || null],
  );

  return getVehicleById(req, id);
}

async function removeFromBlacklist(req, id) {
  assertCanManageVehicles(req);
  const [rows] = await db.execute(`${VEHICLE_SELECT} WHERE v.id_vehicle = ? LIMIT 1`, [id]);
  if (!rows[0]) throw new AppError("Veículo não encontrado.", 404);
  await assertVehicleInScope(req, rows[0]);

  const [result] = await db.execute("DELETE FROM vehicle_black_list WHERE id_vehicle = ?", [id]);
  if (result.affectedRows === 0) {
    throw new AppError("Veículo não está na blacklist frota.", 404);
  }

  return getVehicleById(req, id);
}

async function countVehicleUsage(id) {
  const [serviceAccessRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM service_access_vehicle
     WHERE id_vehicle = ? OR id_substitute_vehicle = ?`,
    [id, id],
  );
  const [movementRows] = await db.execute(
    "SELECT COUNT(*) AS total FROM material_movement WHERE id_vehicle = ?",
    [id],
  );

  return (
    Number(serviceAccessRows[0]?.total || 0) + Number(movementRows[0]?.total || 0)
  );
}

async function deleteVehicle(req, id) {
  assertCanManageVehicles(req);
  const existing = await findVehicleById(id);
  if (!existing) throw new AppError("Veículo não encontrado.", 404);
  await assertVehicleInScope(req, existing);

  const usageCount = await countVehicleUsage(id);
  if (usageCount > 0) {
    throw new AppError(
      "Não é possível excluir: o veículo está vinculado a acessos de serviço ou movimentações.",
      409,
    );
  }

  await db.execute("DELETE FROM vehicle WHERE id_vehicle = ?", [id]);
  return { success: true, plate: existing.plate };
}

async function findVehicleByCompanyPlate(idCompany, plate) {
  const normalized = normalizePlate(plate);
  const [rows] = await db.execute(
    `${VEHICLE_SELECT} WHERE v.id_company = ? AND v.plate = ? LIMIT 1`,
    [idCompany, normalized],
  );
  return rows[0] || null;
}

async function getFleetBulkTemplate(req) {
  assertCanManageVehicles(req);
  const { buildFleetVehicleBulkTemplate } = require("../../utils/bulkTemplateXlsx");
  const scope = buildCompanyScope(req);
  let companies = [];
  if (scope.mode === "admin") {
    const [rows] = await db.execute(
      `SELECT id_company, fancy_name, company_name FROM company WHERE status = 1 ORDER BY fancy_name ASC LIMIT 500`,
    );
    companies = rows;
  } else {
    const id = scope.onlyCompanyId ?? scope.ownCompanyId;
    if (id) {
      const [rows] = await db.execute(
        `SELECT id_company, fancy_name, company_name FROM company WHERE id_company = ? LIMIT 1`,
        [id],
      );
      companies = rows;
    }
  }
  return buildFleetVehicleBulkTemplate({ companies });
}

function publicVehicleExisting(row) {
  return {
    id_vehicle: row.id_vehicle,
    id_company: row.id_company,
    plate: row.plate,
    brand: row.brand || null,
    model: row.model || null,
    color: row.color || null,
    type: row.type || null,
    description: row.description || null,
    status: !!row.status,
    is_blacklisted: !!row.blacklist_reason,
  };
}

async function previewBulkVehicles(req, file) {
  assertCanManageVehicles(req);
  if (!hasPermission(req.user, "fleet", "create") && !hasPermission(req.user, "fleet", "edit")) {
    throw new AppError("Perfil sem permissão para importar veículos.", 403);
  }

  const rawRows = await parseBulkFile(file.buffer, file.mimetype, file.originalname);
  const rows = [];
  const sessionRows = [];

  for (let i = 0; i < rawRows.length; i++) {
    if (isEmptyFleetVehicleBulkRow(rawRows[i])) continue;
    const line = i + 2;
    const payload = normalizeFleetVehicleBulkRow(rawRows[i]);

    if (!payload.plate) {
      const item = {
        line,
        status: "error",
        key: { plate: payload.plate, id_company: payload.id_company },
        incoming: payload,
        message: "Placa obrigatória.",
      };
      rows.push(item);
      sessionRows.push({ ...item, existingId: null });
      continue;
    }

    if (!isValidPlate(payload.plate)) {
      const item = {
        line,
        status: "error",
        key: { plate: payload.plate, id_company: payload.id_company },
        incoming: payload,
        message: "Placa inválida. Use formato antigo (AAA0000) ou Mercosul (AAA0A00).",
      };
      rows.push(item);
      sessionRows.push({ ...item, existingId: null });
      continue;
    }

    let idCompany;
    try {
      idCompany = resolveCompanyIdForCreate(
        req,
        Number.isFinite(payload.id_company) ? payload.id_company : undefined,
      );
    } catch (err) {
      const item = {
        line,
        status: "error",
        key: { plate: payload.plate, id_company: payload.id_company },
        incoming: payload,
        message: err.message || "Empresa inválida.",
      };
      rows.push(item);
      sessionRows.push({ ...item, existingId: null });
      continue;
    }

    const incoming = {
      id_company: idCompany,
      plate: payload.plate,
      brand: payload.brand || null,
      model: payload.model || null,
      color: payload.color || null,
      type: payload.type || null,
      description: payload.description || null,
    };

    const existing = await findVehicleByCompanyPlate(idCompany, payload.plate);
    if (!existing) {
      const item = {
        line,
        status: "create",
        key: { plate: payload.plate, id_company: idCompany },
        incoming,
      };
      rows.push(item);
      sessionRows.push({ ...item, existingId: null });
      continue;
    }

    if (existing.blacklist_reason) {
      const item = {
        line,
        status: "error",
        key: { plate: payload.plate, id_company: idCompany },
        incoming,
        existing: publicVehicleExisting(existing),
        message: "Veículo está na blacklist frota.",
      };
      rows.push(item);
      sessionRows.push({ ...item, existingId: existing.id_vehicle });
      continue;
    }

    if (!existing.status) {
      const item = {
        line,
        status: "error",
        key: { plate: payload.plate, id_company: idCompany },
        incoming,
        existing: publicVehicleExisting(existing),
        message: "Veículo inativo.",
      };
      rows.push(item);
      sessionRows.push({ ...item, existingId: existing.id_vehicle });
      continue;
    }

    const existingPublic = publicVehicleExisting(existing);
    const diffs = buildFieldDiffs(existingPublic, incoming, VEHICLE_BULK_UPDATE_FIELDS);
    const item = {
      line,
      status: diffs.length ? "update" : "link",
      key: { plate: payload.plate, id_company: idCompany },
      incoming,
      existing: existingPublic,
      diffs,
      message: diffs.length ? undefined : "Cadastro idêntico ao existente — nada a atualizar.",
    };
    rows.push(item);
    sessionRows.push({ ...item, existingId: existing.id_vehicle });
  }

  if (!rows.length) {
    throw new AppError(
      "Nenhuma linha de dados encontrada. Cabeçalho: id_company, plate, brand, model, color, type, description.",
      400,
    );
  }

  const previewId = savePreviewSession({
    kind: "fleet_vehicles",
    userId: req.user?.id || null,
    rows: sessionRows,
  });

  return {
    previewId,
    summary: summarizePreviewRows(rows),
    rows,
    updateFields: VEHICLE_BULK_UPDATE_FIELDS,
  };
}

async function commitBulkVehicles(req, { previewId, decisions }) {
  assertCanManageVehicles(req);
  const session = getPreviewSession(previewId, "fleet_vehicles");
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
        if (row.status !== "create") {
          errors.push({ line, reason: "Linha não é um novo cadastro." });
          continue;
        }
        if (!hasPermission(req.user, "fleet", "create")) {
          errors.push({ line, reason: "Sem permissão para criar." });
          continue;
        }
        await createVehicle(req, row.incoming);
        created += 1;
      } else if (action === "update") {
        if (!row.existingId) {
          errors.push({ line, reason: "Linha sem veículo existente." });
          continue;
        }
        if (!hasPermission(req.user, "fleet", "edit")) {
          errors.push({ line, reason: "Sem permissão para editar." });
          continue;
        }
        const patch = pickUpdatePatch(row.incoming, decision.fields, VEHICLE_BULK_UPDATE_FIELDS);
        if (!Object.keys(patch).length) {
          skipped += 1;
          continue;
        }
        await updateVehicle(req, row.existingId, patch);
        updated += 1;
      } else if (action === "link") {
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

module.exports = {
  assertCanManageVehicles,
  listVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  applyVehicleFieldPatch,
  findVehicleById,
  findVehicleByCompanyPlate,
  mapVehicleRow,
  checkVehicleBlacklist,
  addToBlacklist,
  removeFromBlacklist,
  countVehicleUsage,
  deleteVehicle,
  getFleetBulkTemplate,
  previewBulkVehicles,
  commitBulkVehicles,
};
