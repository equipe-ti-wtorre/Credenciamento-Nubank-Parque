const crypto = require("crypto");
const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { buildCompanyScope, applyScopeToWhere } = require("../companies/company.service");
const collaboratorService = require("../collaborators/collaborator.service");
const vehicleService = require("./vehicle.service");
const {
  STATUS_AGUARDANDO_PRODUTORA,
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_APROVADO,
  STATUS_NEGADO,
} = require("../credentials/credentials.schema");
const approvalsService = require("../approvals/approvals.service");
const {
  parseBulkFile,
  normalizeCollaboratorBulkRow,
  normalizeVehicleBulkRow,
  isEmptyCollaboratorBulkRow,
  isEmptyVehicleBulkRow,
  hasCollaboratorCreateFields,
  hasVehicleCreateFields,
} = require("./service-access.bulk");
const { hasPermission, getProfileCodigo } = require("../../utils/permissions");
const { normalizePlate, isValidPlate } = require("../../utils/plate");
const {
  validateAndNormalizeCollaboratorPayload,
} = require("../collaborators/collaborator.schema");
const { savePreviewSession, getPreviewSession, deletePreviewSession } = require("../bulk/previewSession");
const { buildFieldDiffs, pickUpdatePatch, summarizePreviewRows } = require("../bulk/diff");

const SERVICE_COLLAB_UPDATE_FIELDS = ["name", "id_collaborator_role", "rg", "phone"];
const SERVICE_VEHICLE_UPDATE_FIELDS = ["brand", "model", "color", "type", "description"];

const SERVICE_SELECT = `
  SELECT sa.*,
         ast.description AS access_status_description,
         c.fancy_name AS company_fancy_name,
         u.nome_completo AS solicitante_nome,
         u.email AS solicitante_email,
         ap.id AS id_aprovacao,
         ap.status AS aprovacao_status,
         ap.id_setor,
         st.nome AS setor_nome
  FROM service_access sa
  INNER JOIN access_status ast ON ast.id_access_status = sa.id_access_status
  INNER JOIN company c ON c.id_company = sa.id_company
  LEFT JOIN usuarios u ON u.id = sa.id_usuario
  LEFT JOIN aprovacoes ap ON ap.id = (
    SELECT a.id FROM aprovacoes a
    WHERE a.tipo_entidade = 'ACESSO_SERVICO' AND a.id_entidade = sa.id_service_access
    ORDER BY CASE a.status WHEN 'PENDENTE' THEN 0 ELSE 1 END, a.id DESC
    LIMIT 1
  )
  LEFT JOIN setores st ON st.id = ap.id_setor
`;

function getUserRole(req) {
  return getProfileCodigo(req.user);
}

function assertCanManageServices(req) {
  if (!hasPermission(req.user, "service_access", "view")) {
    throw new AppError("Perfil sem permissão para acessos de serviço.", 403);
  }
}

function formatDateField(value) {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Resolve flags de notificação de entrada (colaborador/veículo + legado OR). */
function resolveNotifyEntradaFlags(data, existing = null) {
  const hasColab = data.notificar_entrada_colaborador !== undefined;
  const hasVeic = data.notificar_entrada_veiculo !== undefined;
  const hasLegacy = data.notificar_entrada !== undefined;
  const legacyVal = hasLegacy ? (data.notificar_entrada !== false ? 1 : 0) : null;

  let colab;
  let veic;

  if (hasColab || hasVeic) {
    colab = hasColab
      ? data.notificar_entrada_colaborador !== false
        ? 1
        : 0
      : existing
        ? existing.notificar_entrada_colaborador !== false
          ? 1
          : 0
        : legacyVal != null
          ? legacyVal
          : 1;
    veic = hasVeic
      ? data.notificar_entrada_veiculo !== false
        ? 1
        : 0
      : existing
        ? existing.notificar_entrada_veiculo !== false
          ? 1
          : 0
        : legacyVal != null
          ? legacyVal
          : 1;
  } else if (hasLegacy) {
    colab = legacyVal;
    veic = legacyVal;
  } else if (existing) {
    colab = existing.notificar_entrada_colaborador !== false ? 1 : 0;
    veic = existing.notificar_entrada_veiculo !== false ? 1 : 0;
  } else {
    colab = 1;
    veic = 1;
  }

  return {
    notificar_entrada_colaborador: colab,
    notificar_entrada_veiculo: veic,
    notificar_entrada: colab || veic ? 1 : 0,
  };
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

async function getUserDepartment(userId) {
  if (!userId) return null;
  const [rows] = await db.execute(`SELECT departamento FROM usuarios WHERE id = ? LIMIT 1`, [userId]);
  return rows[0]?.departamento || null;
}

async function assertServiceInScope(req, row) {
  const scope = buildCompanyScope(req);
  if (scope.mode === "admin") return;
  if (scope.mode === "padrao") {
    if (row.id_company !== scope.onlyCompanyId) {
      throw new AppError("Acesso de serviço não encontrado.", 404);
    }
    return;
  }
  if (scope.mode === "produtora") {
    const { conditions, params } = await applyScopeToWhere(scope, "c");
    const [rows] = await db.execute(
      `SELECT 1 FROM company c WHERE c.id_company = ? ${conditions.length ? `AND ${conditions.join(" AND ")}` : ""} LIMIT 1`,
      [row.id_company, ...params],
    );
    if (rows.length === 0) throw new AppError("Acesso de serviço não encontrado.", 404);
  }
}

async function loadServiceCollaborators(idServiceAccess) {
  const [rows] = await db.execute(
    `SELECT sac.*,
            c.name AS collaborator_name,
            c.document AS collaborator_document,
            c.picture AS collaborator_picture,
            c.id_collaborator_role AS master_id_collaborator_role,
            cr.description AS role_description,
            crm.description AS master_role_description
     FROM service_access_collaborator sac
     INNER JOIN collaborator c ON c.id_collaborator = sac.id_collaborator
     INNER JOIN collaborator_role cr ON cr.id_collaborator_role = sac.id_collaborator_role
     LEFT JOIN collaborator_role crm ON crm.id_collaborator_role = c.id_collaborator_role
     WHERE sac.id_service_access = ?
     ORDER BY c.name ASC`,
    [idServiceAccess],
  );
  return rows.map((r) => ({
    id_service_access_collaborator: r.id_service_access_collaborator,
    id_collaborator: r.id_collaborator,
    collaborator_name: r.collaborator_name,
    collaborator_document: r.collaborator_document,
    collaborator_picture: r.collaborator_picture || null,
    id_collaborator_role: r.id_collaborator_role,
    role_description: r.role_description,
    master_id_collaborator_role: r.master_id_collaborator_role ?? null,
    master_role_description: r.master_role_description || null,
    access_id: r.access_id,
    access_check_in: r.access_check_in,
    access_check_out: r.access_check_out,
    id_substitute: r.id_substitute,
  }));
}

async function loadServiceVehicles(idServiceAccess) {
  const [rows] = await db.execute(
    `SELECT sav.*,
            v.plate,
            v.brand,
            v.model,
            v.color,
            v.type,
            v.description AS vehicle_description
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
    brand: r.brand || null,
    model: r.model || null,
    color: r.color || null,
    type: r.type || null,
    vehicle_description: r.vehicle_description || null,
    access_id: r.access_id,
    check_in: r.check_in,
    check_out: r.check_out,
    id_substitute_vehicle: r.id_substitute_vehicle,
  }));
}

async function loadServiceAccessHistory(idServiceAccess) {
  const [rows] = await db.execute(
    `SELECT gal.id,
            gal.kind,
            gal.id_ref,
            gal.access_date,
            gal.check_in,
            gal.check_out,
            c.name AS collaborator_name,
            c.document AS collaborator_document,
            cr.description AS collaborator_role,
            v.plate,
            v.brand,
            v.model,
            v.color
       FROM gate_access_day_log gal
       LEFT JOIN service_access_collaborator sac
         ON gal.kind = 'collaborator'
        AND sac.id_service_access_collaborator = gal.id_ref
       LEFT JOIN collaborator c ON c.id_collaborator = sac.id_collaborator
       LEFT JOIN collaborator_role cr
         ON cr.id_collaborator_role = sac.id_collaborator_role
       LEFT JOIN service_access_vehicle sav
         ON gal.kind = 'vehicle'
        AND sav.id_service_access_vehicle = gal.id_ref
       LEFT JOIN vehicle v ON v.id_vehicle = sav.id_vehicle
      WHERE gal.id_service_access = ?
        AND gal.check_in IS NOT NULL
      ORDER BY gal.access_date DESC, gal.check_in DESC`,
    [idServiceAccess],
  );

  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind,
    id_ref: Number(r.id_ref),
    access_date: formatDateField(r.access_date),
    check_in: r.check_in,
    check_out: r.check_out,
    subject_name: r.kind === "vehicle" ? r.plate : r.collaborator_name,
    subject_detail:
      r.kind === "vehicle"
        ? [r.brand, r.model, r.color].filter(Boolean).join(" ") || null
        : [r.collaborator_document, r.collaborator_role].filter(Boolean).join(" · ") || null,
  }));
}

function mapServiceRow(
  row,
  { collaborators = [], vehicles = [], accessHistory = [] } = {},
) {
  return {
    id_service_access: row.id_service_access,
    id_company: row.id_company,
    id_access_status: row.id_access_status,
    access_status_description: row.access_status_description,
    status: !!row.status,
    start_date: formatDateField(row.start_date),
    end_date: formatDateField(row.end_date),
    finalidade: row.finalidade || row.service_type,
    requesting_department: row.requesting_department,
    observacao: row.observacao ?? row.description,
    notificar_entrada_colaborador:
      row.notificar_entrada_colaborador == null
        ? row.notificar_entrada == null
          ? true
          : !!row.notificar_entrada
        : !!row.notificar_entrada_colaborador,
    notificar_entrada_veiculo:
      row.notificar_entrada_veiculo == null
        ? row.notificar_entrada == null
          ? true
          : !!row.notificar_entrada
        : !!row.notificar_entrada_veiculo,
    notificar_entrada: row.notificar_entrada == null ? true : !!row.notificar_entrada,
    id_setor: row.id_setor || null,
    setor_nome: row.setor_nome || null,
    id_aprovacao: row.id_aprovacao || null,
    aprovacao_status: row.aprovacao_status || null,
    solicitante: row.id_usuario
      ? {
          id: row.id_usuario,
          nome: row.solicitante_nome,
          email: row.solicitante_email,
        }
      : null,
    company_fancy_name: row.company_fancy_name,
    collaborators,
    vehicles,
    access_history: accessHistory,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function buildListFilters(query = {}) {
  const conditions = [];
  const params = [];

  if (query.finalidade) {
    conditions.push("(sa.finalidade LIKE ? OR sa.service_type LIKE ?)");
    params.push(`%${query.finalidade}%`, `%${query.finalidade}%`);
  }
  if (query.requesting_department) {
    conditions.push("sa.requesting_department LIKE ?");
    params.push(`%${query.requesting_department}%`);
  }
  if (query.id_access_status) {
    conditions.push("sa.id_access_status = ?");
    params.push(Number(query.id_access_status));
  }
  if (query.status !== undefined && query.status !== "") {
    conditions.push("sa.status = ?");
    params.push(query.status === "1" || query.status === "true" || query.status === true ? 1 : 0);
  }
  if (query.start_date) {
    conditions.push("sa.end_date >= ?");
    params.push(String(query.start_date).slice(0, 10));
  }
  if (query.end_date) {
    conditions.push("sa.start_date <= ?");
    params.push(String(query.end_date).slice(0, 10));
  }

  return { conditions, params };
}

async function listServiceAccess(req, { page = 1, limit = 20, filters = {} } = {}) {
  assertCanManageServices(req);
  const scope = buildCompanyScope(req);
  const scopeWhere = await applyScopeToWhere(scope, "c");
  const filterData = buildListFilters(filters);

  const conditions = [...scopeWhere.conditions, ...filterData.conditions];
  const params = [...scopeWhere.params, ...filterData.params];
  // Rascunhos do wizard (Aguardando Produtora) ficam ocultos até o envio final.
  if (!filters.include_drafts) {
    conditions.push("sa.id_access_status <> ?");
    params.push(STATUS_AGUARDANDO_PRODUTORA);
  }
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
      const collaborators = await loadServiceCollaborators(row.id_service_access);
      const vehicles = await loadServiceVehicles(row.id_service_access);
      return mapServiceRow(row, { collaborators, vehicles });
    }),
  );

  return {
    services,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

async function ensurePendingApprovalIfMissing(serviceRow) {
  if (!serviceRow) return false;
  if (Number(serviceRow.id_access_status) !== STATUS_AGUARDANDO_APROVACAO) return false;
  if (serviceRow.id_aprovacao && serviceRow.aprovacao_status === "PENDENTE") return false;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await reopenServiceAccessForApproval(conn, serviceRow, {
      idSetor: serviceRow.id_setor || null,
    });
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function repairOrphanApprovals() {
  const [orphans] = await db.execute(
    `SELECT sa.id_service_access, sa.id_usuario, sa.id_access_status, sa.requesting_department
       FROM service_access sa
      WHERE sa.id_access_status = ?
        AND NOT EXISTS (
              SELECT 1 FROM aprovacoes a
               WHERE a.tipo_entidade = 'ACESSO_SERVICO'
                 AND a.id_entidade = sa.id_service_access
                 AND a.status = 'PENDENTE'
            )`,
    [STATUS_AGUARDANDO_APROVACAO],
  );
  for (const row of orphans) {
    try {
      await ensurePendingApprovalIfMissing(row);
    } catch {
      // best-effort
    }
  }
  return orphans.length;
}

async function getServiceAccessById(req, id) {
  assertCanManageServices(req);
  let [rows] = await db.execute(`${SERVICE_SELECT} WHERE sa.id_service_access = ? LIMIT 1`, [id]);
  if (!rows[0]) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, rows[0]);

  if (await ensurePendingApprovalIfMissing(rows[0])) {
    [rows] = await db.execute(`${SERVICE_SELECT} WHERE sa.id_service_access = ? LIMIT 1`, [id]);
  }

  const collaborators = await loadServiceCollaborators(id);
  const vehicles = await loadServiceVehicles(id);
  const accessHistory = await loadServiceAccessHistory(id);
  return mapServiceRow(rows[0], { collaborators, vehicles, accessHistory });
}

async function getServiceAccessRow(id) {
  const [rows] = await db.execute(`${SERVICE_SELECT} WHERE sa.id_service_access = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function createServiceAccess(req, data) {
  assertCanManageServices(req);
  const idCompany = resolveCompanyIdForCreate(req, data.id_company);
  const userId = req.user?.id || null;
  let department = data.requesting_department?.trim();
  if (!department) {
    department = (await getUserDepartment(userId)) || "";
  }
  if (!department) {
    throw new AppError("Informe o departamento solicitante.", 400);
  }

  const startDate = formatDateField(data.start_date);
  const endDate = formatDateField(data.end_date);
  const finalidade = data.finalidade.trim();
  const observacao = data.observacao?.trim() || null;
  const notifyFlags = resolveNotifyEntradaFlags(data);
  const idSetor = Number(data.id_setor);
  const asDraft = data.notify_approvers === false;
  const initialStatus = asDraft ? STATUS_AGUARDANDO_PRODUTORA : STATUS_AGUARDANDO_APROVACAO;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [setorRows] = await conn.execute(
      `SELECT id FROM setores WHERE id = ? AND ativo = 1 LIMIT 1`,
      [idSetor],
    );
    if (!setorRows.length) {
      throw new AppError("Setor aprovador inválido ou inativo.", 400);
    }

    await approvalsService.assertUserCanOpenForSector(conn, idSetor, req.user);

    const [saResult] = await conn.execute(
      `INSERT INTO service_access (
         id_company, id_access_status, service_type, description,
         id_usuario, start_date, end_date, finalidade, requesting_department, observacao,
         notificar_entrada, notificar_entrada_colaborador, notificar_entrada_veiculo, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        idCompany,
        initialStatus,
        finalidade,
        observacao,
        userId,
        startDate,
        endDate,
        finalidade,
        department,
        observacao,
        notifyFlags.notificar_entrada,
        notifyFlags.notificar_entrada_colaborador,
        notifyFlags.notificar_entrada_veiculo,
      ],
    );
    const serviceId = saResult.insertId;

    // Wizard de criação: grava rascunho sem abrir aprovação/evento até o envio final.
    if (asDraft) {
      await conn.commit();
      const service = await getServiceAccessById(req, serviceId);
      return { ...service, approvalCreated: null };
    }

    const approval = await approvalsService.createApprovalFor(conn, {
      tipoEntidade: "ACESSO_SERVICO",
      idEntidade: serviceId,
      idSetor,
      idSolicitante: userId,
    });

    await conn.commit();
    const service = await getServiceAccessById(req, serviceId);
    return { ...service, approvalCreated: approval };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function datesEqual(a, b) {
  return formatDateField(a) === formatDateField(b);
}

async function updateServiceAccessPeriod(req, id, data) {
  assertCanManageServices(req);
  const existing = await getServiceAccessById(req, id);
  const prevStatus = Number(existing.id_access_status);
  if (prevStatus !== STATUS_APROVADO && prevStatus !== STATUS_NEGADO) {
    throw new AppError(
      "Somente acessos aprovados ou negados podem ajustar o período por este fluxo.",
      400,
    );
  }

  const startDate = formatDateField(data.start_date);
  const endDate = formatDateField(data.end_date);
  if (!startDate || !endDate || endDate < startDate) {
    throw new AppError("Intervalo de datas inválido.", 400);
  }

  const datesChanged =
    !datesEqual(startDate, existing.start_date) || !datesEqual(endDate, existing.end_date);

  // Sempre valida conflito de colaboradores no novo período antes de reabrir aprovação.
  await assertCollaboratorsNoDateOverlap(id, startDate, endDate);

  const serviceRow = await getServiceAccessRow(id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE service_access SET start_date = ?, end_date = ? WHERE id_service_access = ?`,
      [startDate, endDate, id],
    );
    if (datesChanged || prevStatus === STATUS_APROVADO || prevStatus === STATUS_NEGADO) {
      await reopenServiceAccessForApproval(conn, serviceRow, {
        force: true,
        idSetor: existing.id_setor || null,
        idSolicitante: req.user?.id || serviceRow.id_usuario || null,
      });
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

async function updateServiceAccess(req, id, data) {
  assertCanManageServices(req);
  const existing = await getServiceAccessById(req, id);
  const prevStatus = Number(existing.id_access_status);

  const startDate = data.start_date != null ? formatDateField(data.start_date) : existing.start_date;
  const endDate = data.end_date != null ? formatDateField(data.end_date) : existing.end_date;
  if (endDate < startDate) {
    throw new AppError("Data fim deve ser igual ou posterior à data início.", 400);
  }

  const finalidade = data.finalidade != null ? data.finalidade.trim() : existing.finalidade;
  const requestingDepartment =
    data.requesting_department != null
      ? data.requesting_department.trim()
      : existing.requesting_department;
  const observacao =
    data.observacao !== undefined
      ? data.observacao?.trim() || null
      : existing.observacao;
  const notifyFieldsSent =
    data.notificar_entrada !== undefined ||
    data.notificar_entrada_colaborador !== undefined ||
    data.notificar_entrada_veiculo !== undefined;
  const notifyFlags = resolveNotifyEntradaFlags(data, existing);
  const flagChanged =
    notifyFieldsSent &&
    (!!notifyFlags.notificar_entrada_colaborador !==
      !!existing.notificar_entrada_colaborador ||
      !!notifyFlags.notificar_entrada_veiculo !== !!existing.notificar_entrada_veiculo ||
      !!notifyFlags.notificar_entrada !== !!existing.notificar_entrada);

  const datesChanged =
    !datesEqual(startDate, existing.start_date) || !datesEqual(endDate, existing.end_date);

  const otherChanged =
    (data.finalidade != null && finalidade !== (existing.finalidade || "")) ||
    (data.observacao !== undefined &&
      (observacao || null) !== (existing.observacao || null)) ||
    (data.id_setor != null && Number(data.id_setor) !== Number(existing.id_setor || 0)) ||
    (data.requesting_department != null &&
      requestingDepartment !== (existing.requesting_department || ""));

  const contentChanged = datesChanged || otherChanged;

  if (datesChanged) {
    await assertCollaboratorsNoDateOverlap(id, startDate, endDate);
  }

  if (prevStatus === STATUS_APROVADO) {
    if (otherChanged) {
      throw new AppError(
        "Acesso aprovado: para alterar a finalidade/setor use a reabertura após ajustar o período, ou cancele o fluxo atual.",
        400,
      );
    }
    if (!datesChanged) {
      if (flagChanged) {
        await db.execute(
          `UPDATE service_access
           SET notificar_entrada = ?,
               notificar_entrada_colaborador = ?,
               notificar_entrada_veiculo = ?
           WHERE id_service_access = ?`,
          [
            notifyFlags.notificar_entrada,
            notifyFlags.notificar_entrada_colaborador,
            notifyFlags.notificar_entrada_veiculo,
            id,
          ],
        );
        const detail = await getServiceAccessById(req, id);
        return { ...detail, approvalNotify: false, contentChanged: false };
      }
      return { ...existing, approvalNotify: false, contentChanged: false };
    }
  }

  if (!contentChanged) {
    if (flagChanged) {
      await db.execute(
        `UPDATE service_access
         SET notificar_entrada = ?,
             notificar_entrada_colaborador = ?,
             notificar_entrada_veiculo = ?
         WHERE id_service_access = ?`,
        [
          notifyFlags.notificar_entrada,
          notifyFlags.notificar_entrada_colaborador,
          notifyFlags.notificar_entrada_veiculo,
          id,
        ],
      );
      const detail = await getServiceAccessById(req, id);
      return { ...detail, approvalNotify: false, contentChanged: false };
    }
    return { ...existing, approvalNotify: false, contentChanged: false };
  }

  await db.execute(
    `UPDATE service_access
     SET start_date = ?, end_date = ?, finalidade = ?, service_type = ?,
         requesting_department = ?, observacao = ?, description = ?,
         notificar_entrada = ?, notificar_entrada_colaborador = ?,
         notificar_entrada_veiculo = ?
     WHERE id_service_access = ?`,
    [
      startDate,
      endDate,
      finalidade,
      finalidade,
      requestingDepartment,
      observacao,
      observacao,
      notifyFlags.notificar_entrada,
      notifyFlags.notificar_entrada_colaborador,
      notifyFlags.notificar_entrada_veiculo,
      id,
    ],
  );

  let idSetor = data.id_setor != null ? Number(data.id_setor) : existing.id_setor || null;
  if (data.id_setor != null) {
    const [setorRows] = await db.execute(
      `SELECT id FROM setores WHERE id = ? AND ativo = 1 LIMIT 1`,
      [idSetor],
    );
    if (!setorRows.length) {
      throw new AppError("Setor aprovador inválido ou inativo.", 400);
    }

    const [flowRows] = await db.execute(
      `SELECT 1 FROM setor_fluxos
       WHERE id_setor = ? AND tipo_entidade = 'ACESSO_SERVICO' AND ativo = 1 LIMIT 1`,
      [idSetor],
    );
    if (!flowRows.length) {
      throw new AppError(
        "Setor não possui fluxo de aprovação ativo para acesso de serviço.",
        422,
      );
    }

    const [upd] = await db.execute(
      `UPDATE aprovacoes
       SET id_setor = ?
       WHERE tipo_entidade = 'ACESSO_SERVICO' AND id_entidade = ? AND status = 'PENDENTE'`,
      [idSetor, id],
    );
    if (upd.affectedRows === 0 && existing.id_aprovacao && existing.aprovacao_status === "PENDENTE") {
      throw new AppError(
        "Não foi possível alterar o setor: aprovação inexistente ou já concluída.",
        400,
      );
    }
  }

  const serviceRow = await getServiceAccessRow(id);
  const mustReopen =
    datesChanged || prevStatus === STATUS_APROVADO || prevStatus === STATUS_NEGADO;

  let reopenResult = { reopened: false, created: false, idAprovacao: null };
  if (mustReopen || prevStatus === STATUS_AGUARDANDO_APROVACAO) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      reopenResult = await reopenServiceAccessForApproval(conn, serviceRow, {
        force: datesChanged || prevStatus === STATUS_APROVADO || prevStatus === STATUS_NEGADO,
        idSetor: idSetor || undefined,
        idSolicitante: req.user?.id || serviceRow.id_usuario || null,
      });
      if (idSetor) {
        await conn.execute(
          `UPDATE aprovacoes
             SET id_setor = ?
           WHERE tipo_entidade = 'ACESSO_SERVICO' AND id_entidade = ? AND status = 'PENDENTE'`,
          [idSetor, id],
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  const detail = await getServiceAccessById(req, id);
  const approvalNotify = !!(
    contentChanged &&
    (detail.id_aprovacao || reopenResult.idAprovacao) &&
    (detail.aprovacao_status === "PENDENTE" ||
      reopenResult.reopened ||
      reopenResult.created)
  );
  return {
    ...detail,
    approvalNotify,
    contentChanged: true,
    id_aprovacao: detail.id_aprovacao || reopenResult.idAprovacao || null,
  };
}

async function generateAccessIds(conn, idServiceAccess, {
  approvedCollaboratorIds,
  approvedVehicleIds,
} = {}) {
  const filterCollaborators = Array.isArray(approvedCollaboratorIds);
  const filterVehicles = Array.isArray(approvedVehicleIds);

  if (filterCollaborators && approvedCollaboratorIds.length) {
    const placeholders = approvedCollaboratorIds.map(() => '?').join(',');
    const [owned] = await conn.execute(
      `SELECT id_service_access_collaborator FROM service_access_collaborator
        WHERE id_service_access = ? AND id_service_access_collaborator IN (${placeholders})`,
      [idServiceAccess, ...approvedCollaboratorIds],
    );
    if (owned.length !== approvedCollaboratorIds.length) {
      throw new AppError('Um ou mais colaboradores selecionados não pertencem a este acesso.', 400);
    }
  }

  if (filterVehicles && approvedVehicleIds.length) {
    const placeholders = approvedVehicleIds.map(() => '?').join(',');
    const [owned] = await conn.execute(
      `SELECT id_service_access_vehicle FROM service_access_vehicle
        WHERE id_service_access = ? AND id_service_access_vehicle IN (${placeholders})`,
      [idServiceAccess, ...approvedVehicleIds],
    );
    if (owned.length !== approvedVehicleIds.length) {
      throw new AppError('Um ou mais veículos selecionados não pertencem a este acesso.', 400);
    }
  }

  if (filterCollaborators) {
    if (approvedCollaboratorIds.length) {
      const placeholders = approvedCollaboratorIds.map(() => '?').join(',');
      const [collaborators] = await conn.execute(
        `SELECT id_service_access_collaborator FROM service_access_collaborator
          WHERE id_service_access = ? AND access_id IS NULL
            AND id_service_access_collaborator IN (${placeholders})`,
        [idServiceAccess, ...approvedCollaboratorIds],
      );
      for (const row of collaborators) {
        await conn.execute(
          `UPDATE service_access_collaborator SET access_id = ? WHERE id_service_access_collaborator = ?`,
          [crypto.randomUUID(), row.id_service_access_collaborator],
        );
      }
    }
  } else {
    const [collaborators] = await conn.execute(
      `SELECT id_service_access_collaborator FROM service_access_collaborator
       WHERE id_service_access = ? AND access_id IS NULL`,
      [idServiceAccess],
    );
    for (const row of collaborators) {
      await conn.execute(
        `UPDATE service_access_collaborator SET access_id = ? WHERE id_service_access_collaborator = ?`,
        [crypto.randomUUID(), row.id_service_access_collaborator],
      );
    }
  }

  if (filterVehicles) {
    if (approvedVehicleIds.length) {
      const placeholders = approvedVehicleIds.map(() => '?').join(',');
      const [vehicles] = await conn.execute(
        `SELECT id_service_access_vehicle FROM service_access_vehicle
          WHERE id_service_access = ? AND access_id IS NULL
            AND id_service_access_vehicle IN (${placeholders})`,
        [idServiceAccess, ...approvedVehicleIds],
      );
      for (const row of vehicles) {
        await conn.execute(
          `UPDATE service_access_vehicle SET access_id = ? WHERE id_service_access_vehicle = ?`,
          [crypto.randomUUID(), row.id_service_access_vehicle],
        );
      }
    }
  } else {
    const [vehicles] = await conn.execute(
      `SELECT id_service_access_vehicle FROM service_access_vehicle
       WHERE id_service_access = ? AND access_id IS NULL`,
      [idServiceAccess],
    );
    for (const row of vehicles) {
      await conn.execute(
        `UPDATE service_access_vehicle SET access_id = ? WHERE id_service_access_vehicle = ?`,
        [crypto.randomUUID(), row.id_service_access_vehicle],
      );
    }
  }
}

async function updateServiceAccessStatus(req, id, { id_access_status: targetStatus, reason }) {
  if (!hasPermission(req.user, "service_access", "edit")) {
    throw new AppError("Apenas usuários autorizados podem alterar status de aprovação.", 403);
  }

  const existing = await getServiceAccessById(req, id);
  if (Number(existing.id_access_status) === STATUS_AGUARDANDO_APROVACAO) {
    throw new AppError(
      "Este acesso aguarda aprovação pelo workflow e não pode ser alterado manualmente.",
      409,
    );
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();
    await conn.execute(`UPDATE service_access SET id_access_status = ? WHERE id_service_access = ?`, [
      targetStatus,
      id,
    ]);

    if (targetStatus === STATUS_APROVADO) {
      await generateAccessIds(conn, id);
    }

    if (targetStatus === STATUS_NEGADO && reason) {
      await conn.execute(
        `UPDATE service_access SET observacao = CONCAT(IFNULL(observacao,''), ?), description = CONCAT(IFNULL(description,''), ?) WHERE id_service_access = ?`,
        [`\n[Negado] ${reason}`, `\n[Negado] ${reason}`, id],
      );
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

async function toggleServiceAccessEnabled(req, id, { status }) {
  if (!hasPermission(req.user, "service_access", "edit")) {
    throw new AppError("Apenas usuários autorizados podem habilitar ou desabilitar acessos.", 403);
  }

  await getServiceAccessById(req, id);
  await db.execute(`UPDATE service_access SET status = ? WHERE id_service_access = ?`, [
    status ? 1 : 0,
    id,
  ]);
  return getServiceAccessById(req, id);
}

async function assertCollaboratorForService(serviceRow, collaborator) {
  if (!collaborator.status) {
    throw new AppError("Colaborador está inativo.", 400);
  }
  const isBlacklisted = await collaboratorService.checkBlacklist(collaborator.id_collaborator);
  if (isBlacklisted) {
    throw new AppError("Colaborador consta na lista de bloqueio.", 400);
  }
}

/**
 * Bloqueia o mesmo colaborador em outro acesso de serviço com datas sobrepostas
 * (status ativo e não negado). Rascunhos com vínculo também contam.
 */
async function findOverlappingServiceCollaborator(
  idCollaborator,
  startDate,
  endDate,
  excludeServiceAccessId,
) {
  const start = formatDateField(startDate);
  const end = formatDateField(endDate);
  if (!idCollaborator || !start || !end) return null;

  // Negados não contam como conflito.
  const params = [idCollaborator, idCollaborator, STATUS_NEGADO, end, start];
  let excludeSql = "";
  if (excludeServiceAccessId != null) {
    excludeSql = " AND sa.id_service_access <> ?";
    params.push(Number(excludeServiceAccessId));
  }

  const [rows] = await db.execute(
    `SELECT sa.id_service_access,
            sa.finalidade,
            sa.start_date,
            sa.end_date,
            c.fancy_name AS company_fancy_name
       FROM service_access_collaborator sac
       INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
       INNER JOIN company c ON c.id_company = sa.id_company
      WHERE (sac.id_collaborator = ? OR sac.id_substitute = ?)
        AND sa.status = 1
        AND sa.id_access_status <> ?
        AND sa.start_date <= ?
        AND sa.end_date >= ?
        ${excludeSql}
      LIMIT 1`,
    params,
  );
  return rows[0] || null;
}

async function assertNoOverlappingServiceCollaborator(
  idCollaborator,
  startDate,
  endDate,
  excludeServiceAccessId,
  collaboratorName = null,
) {
  const conflict = await findOverlappingServiceCollaborator(
    idCollaborator,
    startDate,
    endDate,
    excludeServiceAccessId,
  );
  if (!conflict) return;

  let name = collaboratorName && String(collaboratorName).trim();
  if (!name) {
    const [nameRows] = await db.execute(
      `SELECT name FROM collaborator WHERE id_collaborator = ? LIMIT 1`,
      [idCollaborator],
    );
    name = nameRows[0]?.name || "Colaborador";
  }

  const label = [conflict.company_fancy_name, conflict.finalidade]
    .filter(Boolean)
    .join(" — ");
  throw new AppError(
    `${name} já está cadastrado em outro acesso de serviço com data sobreposta${
      label ? ` (${label})` : ""
    }.`,
    409,
    true,
    {
      collaborator_name: name,
      id_collaborator: Number(idCollaborator),
      conflict_label: label || null,
      conflict_id_service_access: Number(conflict.id_service_access),
      conflict_start_date: formatDateField(conflict.start_date),
      conflict_end_date: formatDateField(conflict.end_date),
    },
    "SERVICE_COLLABORATOR_DATE_OVERLAP",
  );
}

async function assertCollaboratorsNoDateOverlap(idServiceAccess, startDate, endDate) {
  const collaborators = await loadServiceCollaborators(idServiceAccess);
  for (const c of collaborators) {
    await assertNoOverlappingServiceCollaborator(
      c.id_collaborator,
      startDate,
      endDate,
      idServiceAccess,
      c.collaborator_name,
    );
  }
}

async function assertVehicleForService(serviceRow, vehicle) {
  if (!vehicle.status) {
    throw new AppError(`Veículo ${vehicle.plate} está inativo.`, 400);
  }
  if (vehicle.blacklist_reason) {
    throw new AppError(`Veículo ${vehicle.plate} consta na lista de restrição.`, 400);
  }
}

async function findCollaboratorByDocumentAny(document) {
  const trimmed = String(document || "").trim();
  const [rows] = await db.execute(
    `SELECT c.* FROM collaborator c WHERE c.document = ? LIMIT 1`,
    [trimmed],
  );
  if (rows[0]) return rows[0];
  const digits = trimmed.replace(/\D/g, "");
  if (digits && digits !== trimmed) {
    const [digitRows] = await db.execute(
      `SELECT c.* FROM collaborator c WHERE c.document = ? LIMIT 1`,
      [digits],
    );
    return digitRows[0] || null;
  }
  return null;
}

async function findRoleByDescription(description) {
  const [rows] = await db.execute(
    `SELECT id_collaborator_role FROM collaborator_role WHERE description = ? LIMIT 1`,
    [description],
  );
  return rows[0]?.id_collaborator_role || null;
}

async function findDocumentTypeByDescription(description) {
  const [rows] = await db.execute(
    `SELECT id_collaborator_document_type FROM collaborator_document_type
     WHERE description = ? LIMIT 1`,
    [String(description || "").trim()],
  );
  return rows[0]?.id_collaborator_document_type || null;
}

async function findVehicleByPlate(idCompany, plate) {
  const normalized = normalizePlate(plate);
  const [rows] = await db.execute(
    `SELECT v.*, vbl.reason AS blacklist_reason
     FROM vehicle v
     LEFT JOIN vehicle_black_list vbl ON vbl.id_vehicle = v.id_vehicle
     WHERE v.id_company = ? AND v.plate = ? LIMIT 1`,
    [idCompany, normalized],
  );
  if (rows[0]) return rows[0];

  const [anyRows] = await db.execute(
    `SELECT v.*, vbl.reason AS blacklist_reason
     FROM vehicle v
     LEFT JOIN vehicle_black_list vbl ON vbl.id_vehicle = v.id_vehicle
     WHERE v.plate = ? LIMIT 1`,
    [normalized],
  );
  return anyRows[0] || null;
}

async function createVehicleRecordForService(serviceRow, data) {
  const plate = normalizePlate(data.plate);
  if (!isValidPlate(plate)) {
    throw new AppError(
      "Placa inválida. Use formato antigo (AAA0000) ou Mercosul (AAA0A00).",
      400,
    );
  }
  const [result] = await db.execute(
    `INSERT INTO vehicle (id_company, plate, brand, model, color, type, description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      serviceRow.id_company,
      plate,
      data.brand || null,
      data.model || null,
      data.color || null,
      data.type || null,
      data.description || null,
    ],
  );
  return vehicleService.findVehicleById(result.insertId);
}

async function resolveServiceSetorId(conn, idServiceAccess, serviceRow = null) {
  const [rows] = await conn.execute(
    `SELECT id_setor FROM aprovacoes
      WHERE tipo_entidade = 'ACESSO_SERVICO' AND id_entidade = ?
      ORDER BY CASE status WHEN 'PENDENTE' THEN 0 ELSE 1 END, id DESC
      LIMIT 1`,
    [idServiceAccess],
  );
  if (rows[0]?.id_setor != null) return Number(rows[0].id_setor);

  const department =
    serviceRow?.requesting_department ||
    serviceRow?.requestingDepartment ||
    null;
  if (department) {
    const [setorRows] = await conn.execute(
      `SELECT id FROM setores WHERE ativo = 1 AND nome = ? LIMIT 1`,
      [String(department).trim()],
    );
    if (setorRows[0]?.id != null) return Number(setorRows[0].id);
  }

  const [fallback] = await conn.execute(
    `SELECT s.id
       FROM setores s
       INNER JOIN setor_fluxos sf
         ON sf.id_setor = s.id AND sf.tipo_entidade = 'ACESSO_SERVICO' AND sf.ativo = 1
      WHERE s.ativo = 1
      ORDER BY s.id ASC
      LIMIT 1`,
  );
  return fallback[0]?.id != null ? Number(fallback[0].id) : null;
}

/**
 * Garante aprovação pendente: reabre após aprovado/negado ou repara órfãos
 * (status aguardando sem linha em aprovacoes).
 */
async function reopenServiceAccessForApproval(
  conn,
  serviceRow,
  { force = false, idSetor = null, idSolicitante = null } = {},
) {
  const idServiceAccess = serviceRow.id_service_access || serviceRow.id;
  const status = Number(serviceRow.id_access_status);
  const needsReopen =
    force || status === STATUS_APROVADO || status === STATUS_NEGADO;

  const [pending] = await conn.execute(
    `SELECT id FROM aprovacoes
      WHERE tipo_entidade = 'ACESSO_SERVICO' AND id_entidade = ? AND status = 'PENDENTE'
      LIMIT 1`,
    [idServiceAccess],
  );

  if (pending.length) {
    if (needsReopen) {
      await conn.execute(
        `UPDATE service_access SET id_access_status = ? WHERE id_service_access = ?`,
        [STATUS_AGUARDANDO_APROVACAO, idServiceAccess],
      );
      return { reopened: true, created: false, idAprovacao: pending[0].id };
    }
    return { reopened: false, created: false, idAprovacao: pending[0].id };
  }

  // Sem pendência: cria (reabertura ou órfão em aguardando)
  if (!needsReopen && status !== STATUS_AGUARDANDO_APROVACAO) {
    return { reopened: false, created: false, idAprovacao: null };
  }

  await conn.execute(
    `UPDATE service_access SET id_access_status = ? WHERE id_service_access = ?`,
    [STATUS_AGUARDANDO_APROVACAO, idServiceAccess],
  );

  const resolvedSetor =
    idSetor != null
      ? Number(idSetor)
      : await resolveServiceSetorId(conn, idServiceAccess, serviceRow);
  if (!resolvedSetor) {
    throw new AppError(
      "Não foi possível abrir a aprovação: setor aprovador não encontrado.",
      422,
    );
  }

  let resolvedSolicitante = idSolicitante || serviceRow.id_usuario;
  if (!resolvedSolicitante) {
    const [solRows] = await conn.execute(
      `SELECT id_solicitante FROM aprovacoes
        WHERE tipo_entidade = 'ACESSO_SERVICO' AND id_entidade = ?
        ORDER BY id ASC
        LIMIT 1`,
      [idServiceAccess],
    );
    resolvedSolicitante = solRows[0]?.id_solicitante || null;
  }
  if (!resolvedSolicitante) {
    throw new AppError(
      "Não foi possível abrir a aprovação: solicitante não encontrado.",
      422,
    );
  }

  const approval = await approvalsService.createApprovalFor(conn, {
    tipoEntidade: "ACESSO_SERVICO",
    idEntidade: idServiceAccess,
    idSetor: resolvedSetor,
    idSolicitante: resolvedSolicitante,
  });

  return { reopened: true, created: true, idAprovacao: approval.id };
}

async function assertRoleExists(id) {
  const [rows] = await db.execute(
    `SELECT id_collaborator_role FROM collaborator_role WHERE id_collaborator_role = ? LIMIT 1`,
    [id],
  );
  if (!rows[0]) throw new AppError("Função/cargo inválido.", 422);
}

async function addCollaborator(req, id, data) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);

  const collaborator = await collaboratorService.findCollaboratorById(data.id_collaborator);
  if (!collaborator) throw new AppError("Colaborador não encontrado.", 404);
  await assertCollaboratorForService(serviceRow, collaborator);
  await assertRoleExists(data.id_collaborator_role);
  await assertNoOverlappingServiceCollaborator(
    data.id_collaborator,
    serviceRow.start_date,
    serviceRow.end_date,
    id,
  );

  const [existing] = await db.execute(
    `SELECT 1 FROM service_access_collaborator WHERE id_service_access = ? AND id_collaborator = ? LIMIT 1`,
    [id, data.id_collaborator],
  );
  if (existing.length > 0) {
    throw new AppError("Colaborador já vinculado a este acesso.", 409);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO service_access_collaborator (id_service_access, id_collaborator, id_collaborator_role)
       VALUES (?, ?, ?)`,
      [id, data.id_collaborator, data.id_collaborator_role],
    );
    await reopenServiceAccessForApproval(conn, serviceRow);
    await conn.commit();
    return getServiceAccessById(req, id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function removeCollaborator(req, id, linkId) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.execute(
      `SELECT sac.id_service_access_collaborator, c.name AS collaborator_name, c.document AS collaborator_document
         FROM service_access_collaborator sac
         INNER JOIN collaborator c ON c.id_collaborator = sac.id_collaborator
        WHERE sac.id_service_access_collaborator = ? AND sac.id_service_access = ?
        LIMIT 1`,
      [linkId, id],
    );
    if (!existing.length) {
      throw new AppError("Vínculo de colaborador não encontrado.", 404);
    }
    await conn.execute(
      `DELETE FROM service_access_collaborator WHERE id_service_access_collaborator = ? AND id_service_access = ?`,
      [linkId, id],
    );
    await reopenServiceAccessForApproval(conn, serviceRow);
    await conn.commit();
    const service = await getServiceAccessById(req, id);
    return {
      ...service,
      removido: {
        tipo: "colaborador",
        nome: existing[0].collaborator_name,
        documento: existing[0].collaborator_document,
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function bulkAddCollaborators(req, id, file) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);

  const rawRows = await parseBulkFile(file.buffer, file.mimetype, file.originalname);
  const errors = [];
  let successCount = 0;
  let totalProcessed = 0;

  for (let i = 0; i < rawRows.length; i++) {
    if (isEmptyCollaboratorBulkRow(rawRows[i])) continue;
    const line = i + 2;
    totalProcessed += 1;
    const payload = normalizeCollaboratorBulkRow(rawRows[i]);

    if (!payload.document) {
      errors.push({ line, reason: "Documento obrigatório." });
      continue;
    }

    let roleId = payload.id_collaborator_role;
    if (!Number.isFinite(roleId) && payload.role) {
      roleId = await findRoleByDescription(payload.role);
    }

    let docTypeId = payload.id_collaborator_document_type;
    if (!Number.isFinite(docTypeId) && payload.document_type) {
      docTypeId = await findDocumentTypeByDescription(payload.document_type);
    }

    let collaborator = await findCollaboratorByDocumentAny(payload.document);

    if (!collaborator) {
      if (!hasCollaboratorCreateFields({ ...payload, id_collaborator_document_type: docTypeId, id_collaborator_role: roleId })) {
        errors.push({
          line,
          reason:
            `Colaborador não encontrado: ${payload.document}. Informe name, id_collaborator_document_type e id_collaborator_role para cadastrar.`,
        });
        continue;
      }

      const validated = await validateAndNormalizeCollaboratorPayload({
        document: payload.document,
        id_collaborator_document_type: docTypeId,
        name: payload.name,
        id_collaborator_role: roleId,
        rg: payload.rg,
        phone: payload.phone,
        status: true,
      });
      if (validated.error) {
        errors.push({ line, reason: validated.error });
        continue;
      }

      try {
        collaborator = await collaboratorService.insertCollaboratorRecord(validated.value);
      } catch (err) {
        errors.push({
          line,
          reason: err.message || "Erro ao cadastrar colaborador.",
        });
        continue;
      }
    }

    if (!Number.isFinite(roleId)) {
      roleId = collaborator.id_collaborator_role;
    }
    if (!Number.isFinite(roleId)) {
      errors.push({ line, reason: "Função inválida. Use id_collaborator_role ou role." });
      continue;
    }

    try {
      await assertCollaboratorForService(serviceRow, collaborator);
      await assertRoleExists(roleId);
      await assertNoOverlappingServiceCollaborator(
        collaborator.id_collaborator,
        serviceRow.start_date,
        serviceRow.end_date,
        id,
      );

      const [existing] = await db.execute(
        `SELECT 1 FROM service_access_collaborator WHERE id_service_access = ? AND id_collaborator = ? LIMIT 1`,
        [id, collaborator.id_collaborator],
      );
      if (existing.length > 0) {
        errors.push({ line, reason: "Colaborador já vinculado." });
        continue;
      }

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const [result] = await conn.execute(
          `INSERT INTO service_access_collaborator (id_service_access, id_collaborator, id_collaborator_role)
           VALUES (?, ?, ?)`,
          [id, collaborator.id_collaborator, roleId],
        );

        await conn.commit();
        successCount += 1;
      } catch (err) {
        await conn.rollback();
        errors.push({ line, reason: err.message || "Erro ao vincular colaborador." });
      } finally {
        conn.release();
      }
    } catch (err) {
      errors.push({ line, reason: err.message || "Erro ao vincular colaborador." });
    }
  }

  if (totalProcessed === 0) {
    throw new AppError(
      "Nenhuma linha de dados encontrada. Cabeçalho: document, id_collaborator_document_type, name, id_collaborator_role, rg, phone.",
      400,
    );
  }

  if (successCount > 0) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await reopenServiceAccessForApproval(conn, serviceRow);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  return { totalProcessed, successCount, errors };
}

async function addVehicle(req, id, data) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);

  const vehicle = await vehicleService.findVehicleById(data.id_vehicle);
  if (!vehicle) throw new AppError("Veículo não encontrado.", 404);
  await assertVehicleForService(serviceRow, vehicle);

  const [existing] = await db.execute(
    `SELECT 1 FROM service_access_vehicle WHERE id_service_access = ? AND id_vehicle = ? LIMIT 1`,
    [id, data.id_vehicle],
  );
  if (existing.length > 0) {
    throw new AppError("Veículo já vinculado a este acesso.", 409);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO service_access_vehicle (id_service_access, id_vehicle) VALUES (?, ?)`,
      [id, data.id_vehicle],
    );
    await reopenServiceAccessForApproval(conn, serviceRow);
    await conn.commit();
    return getServiceAccessById(req, id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function removeVehicle(req, id, linkId) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.execute(
      `SELECT sav.id_service_access_vehicle, v.plate, v.brand, v.model
         FROM service_access_vehicle sav
         INNER JOIN vehicle v ON v.id_vehicle = sav.id_vehicle
        WHERE sav.id_service_access_vehicle = ? AND sav.id_service_access = ?
        LIMIT 1`,
      [linkId, id],
    );
    if (!existing.length) {
      throw new AppError("Vínculo de veículo não encontrado.", 404);
    }
    await conn.execute(
      `DELETE FROM service_access_vehicle WHERE id_service_access_vehicle = ? AND id_service_access = ?`,
      [linkId, id],
    );
    await reopenServiceAccessForApproval(conn, serviceRow);
    await conn.commit();
    const service = await getServiceAccessById(req, id);
    return {
      ...service,
      removido: {
        tipo: "veiculo",
        placa: existing[0].plate,
        marca: existing[0].brand,
        modelo: existing[0].model,
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function bulkAddVehicles(req, id, file) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);

  const rawRows = await parseBulkFile(file.buffer, file.mimetype, file.originalname);
  const errors = [];
  let successCount = 0;
  let totalProcessed = 0;

  for (let i = 0; i < rawRows.length; i++) {
    if (isEmptyVehicleBulkRow(rawRows[i])) continue;
    const line = i + 2;
    totalProcessed += 1;
    const payload = normalizeVehicleBulkRow(rawRows[i]);

    if (!payload.plate) {
      errors.push({ line, reason: "Placa obrigatória." });
      continue;
    }

    let vehicle = await findVehicleByPlate(serviceRow.id_company, payload.plate);

    if (!vehicle) {
      if (!hasVehicleCreateFields(payload)) {
        errors.push({
          line,
          reason:
            `Veículo não encontrado: ${payload.plate}. Informe brand, model, color e type para cadastrar.`,
        });
        continue;
      }
      try {
        vehicle = await createVehicleRecordForService(serviceRow, payload);
      } catch (err) {
        errors.push({ line, reason: err.message || "Erro ao cadastrar veículo." });
        continue;
      }
    }

    try {
      await assertVehicleForService(serviceRow, vehicle);

      const [existing] = await db.execute(
        `SELECT 1 FROM service_access_vehicle WHERE id_service_access = ? AND id_vehicle = ? LIMIT 1`,
        [id, vehicle.id_vehicle],
      );
      if (existing.length > 0) {
        errors.push({ line, reason: "Veículo já vinculado." });
        continue;
      }

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const [result] = await conn.execute(
          `INSERT INTO service_access_vehicle (id_service_access, id_vehicle) VALUES (?, ?)`,
          [id, vehicle.id_vehicle],
        );

        await conn.commit();
        successCount += 1;
      } catch (err) {
        await conn.rollback();
        errors.push({ line, reason: err.message || "Erro ao vincular veículo." });
      } finally {
        conn.release();
      }
    } catch (err) {
      errors.push({ line, reason: err.message || "Erro ao vincular veículo." });
    }
  }

  if (totalProcessed === 0) {
    throw new AppError(
      "Nenhuma linha de dados encontrada. Cabeçalho: plate, brand, model, color, type, description.",
      400,
    );
  }

  if (successCount > 0) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await reopenServiceAccessForApproval(conn, serviceRow);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  return { totalProcessed, successCount, errors };
}

async function markApproved(conn, idEntidade, ctx = {}) {
  await conn.execute(`UPDATE service_access SET id_access_status = ? WHERE id_service_access = ?`, [
    STATUS_APROVADO,
    idEntidade,
  ]);
  await generateAccessIds(conn, idEntidade, {
    approvedCollaboratorIds: ctx.approvedCollaboratorIds,
    approvedVehicleIds: ctx.approvedVehicleIds,
  });
}

async function markRejected(conn, idEntidade) {
  await conn.execute(`UPDATE service_access SET id_access_status = ? WHERE id_service_access = ?`, [
    STATUS_NEGADO,
    idEntidade,
  ]);
}

async function getCollaboratorsBulkTemplate() {
  const { buildServiceAccessCollaboratorBulkTemplate } = require("../../utils/bulkTemplateXlsx");
  const [types, roles] = await Promise.all([
    collaboratorService.listDocumentTypes(),
    collaboratorService.listRoles(),
  ]);
  return buildServiceAccessCollaboratorBulkTemplate({ types, roles });
}

async function getVehiclesBulkTemplate() {
  const { buildServiceAccessVehicleBulkTemplate } = require("../../utils/bulkTemplateXlsx");
  return buildServiceAccessVehicleBulkTemplate();
}

async function isCollaboratorLinked(serviceId, collaboratorId) {
  const [rows] = await db.execute(
    `SELECT 1 FROM service_access_collaborator WHERE id_service_access = ? AND id_collaborator = ? LIMIT 1`,
    [serviceId, collaboratorId],
  );
  return rows.length > 0;
}

async function isVehicleLinked(serviceId, vehicleId) {
  const [rows] = await db.execute(
    `SELECT 1 FROM service_access_vehicle WHERE id_service_access = ? AND id_vehicle = ? LIMIT 1`,
    [serviceId, vehicleId],
  );
  return rows.length > 0;
}

async function linkCollaboratorToService(serviceId, collaboratorId, roleId) {
  const serviceRow = await getServiceAccessRow(serviceId);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertNoOverlappingServiceCollaborator(
    collaboratorId,
    serviceRow.start_date,
    serviceRow.end_date,
    serviceId,
  );

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO service_access_collaborator (id_service_access, id_collaborator, id_collaborator_role)
       VALUES (?, ?, ?)`,
      [serviceId, collaboratorId, roleId],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function linkVehicleToService(serviceId, vehicleId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO service_access_vehicle (id_service_access, id_vehicle) VALUES (?, ?)`,
      [serviceId, vehicleId],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function previewBulkServiceCollaborators(req, id, file) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);

  const rawRows = await parseBulkFile(file.buffer, file.mimetype, file.originalname);
  const rows = [];
  const sessionRows = [];

  for (let i = 0; i < rawRows.length; i++) {
    if (isEmptyCollaboratorBulkRow(rawRows[i])) continue;
    const line = i + 2;
    const payload = normalizeCollaboratorBulkRow(rawRows[i]);

    if (!payload.document) {
      const item = {
        line,
        status: "error",
        key: { document: payload.document },
        incoming: payload,
        message: "Documento obrigatório.",
      };
      rows.push(item);
      sessionRows.push({ ...item, existingId: null, roleId: null, alreadyLinked: false });
      continue;
    }

    let roleId = payload.id_collaborator_role;
    if (!Number.isFinite(roleId) && payload.role) {
      roleId = await findRoleByDescription(payload.role);
    }
    let docTypeId = payload.id_collaborator_document_type;
    if (!Number.isFinite(docTypeId) && payload.document_type) {
      docTypeId = await findDocumentTypeByDescription(payload.document_type);
    }

    let collaborator = await findCollaboratorByDocumentAny(payload.document);

    if (!collaborator) {
      if (
        !hasCollaboratorCreateFields({
          ...payload,
          id_collaborator_document_type: docTypeId,
          id_collaborator_role: roleId,
        })
      ) {
        const item = {
          line,
          status: "error",
          key: { document: payload.document },
          incoming: payload,
          message: `Colaborador não encontrado: ${payload.document}. Informe name, tipo e função para cadastrar.`,
        };
        rows.push(item);
        sessionRows.push({ ...item, existingId: null, roleId: null, alreadyLinked: false, validated: null });
        continue;
      }

      const validated = await validateAndNormalizeCollaboratorPayload({
        document: payload.document,
        id_collaborator_document_type: docTypeId,
        name: payload.name,
        id_collaborator_role: roleId,
        rg: payload.rg,
        phone: payload.phone,
        status: true,
      });
      if (validated.error) {
        const item = {
          line,
          status: "error",
          key: { document: payload.document },
          incoming: payload,
          message: validated.error,
        };
        rows.push(item);
        sessionRows.push({ ...item, existingId: null, roleId: null, alreadyLinked: false, validated: null });
        continue;
      }

      const item = {
        line,
        status: "create",
        key: { document: validated.value.document },
        incoming: validated.value,
      };
      rows.push(item);
      sessionRows.push({
        ...item,
        existingId: null,
        roleId: validated.value.id_collaborator_role,
        alreadyLinked: false,
        validated: validated.value,
      });
      continue;
    }

    try {
      await assertCollaboratorForService(serviceRow, collaborator);
    } catch (err) {
      const item = {
        line,
        status: "error",
        key: { document: collaborator.document },
        incoming: payload,
        message: err.message,
      };
      rows.push(item);
      sessionRows.push({
        ...item,
        existingId: collaborator.id_collaborator,
        roleId: null,
        alreadyLinked: false,
        validated: null,
      });
      continue;
    }

    try {
      await assertNoOverlappingServiceCollaborator(
        collaborator.id_collaborator,
        serviceRow.start_date,
        serviceRow.end_date,
        id,
      );
    } catch (err) {
      const item = {
        line,
        status: "error",
        key: { document: collaborator.document },
        incoming: payload,
        message: err.message,
      };
      rows.push(item);
      sessionRows.push({
        ...item,
        existingId: collaborator.id_collaborator,
        roleId: null,
        alreadyLinked: false,
        validated: null,
      });
      continue;
    }

    if (!Number.isFinite(roleId)) {
      roleId = collaborator.id_collaborator_role;
    }
    if (!Number.isFinite(roleId)) {
      const item = {
        line,
        status: "error",
        key: { document: collaborator.document },
        incoming: payload,
        message: "Função inválida. Use id_collaborator_role ou role.",
      };
      rows.push(item);
      sessionRows.push({
        ...item,
        existingId: collaborator.id_collaborator,
        roleId: null,
        alreadyLinked: false,
        validated: null,
      });
      continue;
    }

    const alreadyLinked = await isCollaboratorLinked(id, collaborator.id_collaborator);
    const incoming = {
      document: collaborator.document,
      id_collaborator_document_type: collaborator.id_collaborator_document_type,
      name: payload.name || collaborator.name,
      id_collaborator_role: roleId,
      rg: payload.rg !== undefined ? payload.rg || null : collaborator.rg,
      phone: payload.phone !== undefined ? payload.phone || null : collaborator.phone,
    };
    const existingPublic = {
      id_collaborator: collaborator.id_collaborator,
      document: collaborator.document,
      name: collaborator.name,
      id_collaborator_role: collaborator.id_collaborator_role,
      rg: collaborator.rg || null,
      phone: collaborator.phone || null,
    };
    const diffs = buildFieldDiffs(existingPublic, incoming, SERVICE_COLLAB_UPDATE_FIELDS);

    if (alreadyLinked && !diffs.length) {
      const item = {
        line,
        status: "error",
        key: { document: collaborator.document },
        incoming,
        existing: existingPublic,
        message: "Colaborador já vinculado.",
      };
      rows.push(item);
      sessionRows.push({
        ...item,
        existingId: collaborator.id_collaborator,
        roleId,
        alreadyLinked: true,
        validated: incoming,
      });
      continue;
    }

    const status = diffs.length ? "update" : "link";
    const item = {
      line,
      status,
      key: { document: collaborator.document },
      incoming,
      existing: existingPublic,
      diffs,
      alreadyLinked,
      message: alreadyLinked
        ? "Já vinculado — apenas atualização cadastral."
        : diffs.length
          ? "Atualizar cadastro e vincular ao acesso."
          : "Vincular colaborador existente.",
    };
    rows.push(item);
    sessionRows.push({
      ...item,
      existingId: collaborator.id_collaborator,
      roleId,
      alreadyLinked,
      validated: incoming,
    });
  }

  if (!rows.length) {
    throw new AppError(
      "Nenhuma linha de dados encontrada. Cabeçalho: document, id_collaborator_document_type, name, id_collaborator_role.",
      400,
    );
  }

  const previewId = savePreviewSession({
    kind: "service_collaborators",
    serviceId: Number(id),
    userId: req.user?.id || null,
    rows: sessionRows,
  });

  return {
    previewId,
    summary: summarizePreviewRows(rows),
    rows,
    updateFields: SERVICE_COLLAB_UPDATE_FIELDS,
  };
}

async function commitBulkServiceCollaborators(req, id, { previewId, decisions }) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);

  const session = getPreviewSession(previewId, "service_collaborators");
  if (Number(session.serviceId) !== Number(id)) {
    throw new AppError("Pré-visualização de outro acesso de serviço.", 400);
  }

  const byLine = new Map(session.rows.map((r) => [r.line, r]));
  const decisionList = Array.isArray(decisions) ? decisions : [];
  const errors = [];
  let created = 0;
  let updated = 0;
  let linked = 0;
  let skipped = 0;

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
        const createdCollab = await collaboratorService.insertCollaboratorRecord(row.validated);
        await linkCollaboratorToService(
          id,
          createdCollab.id_collaborator,
          row.roleId || createdCollab.id_collaborator_role,
        );
        created += 1;
        linked += 1;
      } else if (action === "update") {
        if (!row.existingId) {
          errors.push({ line, reason: "Sem cadastro existente." });
          continue;
        }
        const patch = pickUpdatePatch(row.validated || {}, decision.fields, SERVICE_COLLAB_UPDATE_FIELDS);
        if (Object.keys(patch).length) {
          await collaboratorService.applyCollaboratorFieldPatch(row.existingId, patch);
          updated += 1;
        }
        if (!row.alreadyLinked) {
          await linkCollaboratorToService(id, row.existingId, row.roleId);
          linked += 1;
        }
      } else if (action === "link") {
        if (!row.existingId) {
          errors.push({ line, reason: "Sem cadastro existente." });
          continue;
        }
        if (row.alreadyLinked) {
          skipped += 1;
          continue;
        }
        await linkCollaboratorToService(id, row.existingId, row.roleId);
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
  if (created + updated + linked > 0) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await reopenServiceAccessForApproval(conn, serviceRow);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
  return { created, updated, linked, skipped, errors, totalDecisions: decisionList.length };
}

async function previewBulkServiceVehicles(req, id, file) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);

  const rawRows = await parseBulkFile(file.buffer, file.mimetype, file.originalname);
  const rows = [];
  const sessionRows = [];

  for (let i = 0; i < rawRows.length; i++) {
    if (isEmptyVehicleBulkRow(rawRows[i])) continue;
    const line = i + 2;
    const payload = normalizeVehicleBulkRow(rawRows[i]);

    if (!payload.plate) {
      const item = {
        line,
        status: "error",
        key: { plate: "" },
        incoming: payload,
        message: "Placa obrigatória.",
      };
      rows.push(item);
      sessionRows.push({ ...item, existingId: null, alreadyLinked: false });
      continue;
    }

    if (!isValidPlate(payload.plate)) {
      const item = {
        line,
        status: "error",
        key: { plate: payload.plate },
        incoming: payload,
        message: "Placa inválida.",
      };
      rows.push(item);
      sessionRows.push({ ...item, existingId: null, alreadyLinked: false });
      continue;
    }

    let vehicle = await findVehicleByPlate(serviceRow.id_company, payload.plate);

    if (!vehicle) {
      if (!hasVehicleCreateFields(payload)) {
        const item = {
          line,
          status: "error",
          key: { plate: payload.plate },
          incoming: payload,
          message: `Veículo não encontrado: ${payload.plate}. Informe brand, model, color e type para cadastrar.`,
        };
        rows.push(item);
        sessionRows.push({ ...item, existingId: null, alreadyLinked: false });
        continue;
      }
      const incoming = {
        plate: payload.plate,
        brand: payload.brand,
        model: payload.model,
        color: payload.color,
        type: payload.type,
        description: payload.description || null,
      };
      const item = {
        line,
        status: "create",
        key: { plate: payload.plate },
        incoming,
      };
      rows.push(item);
      sessionRows.push({ ...item, existingId: null, alreadyLinked: false });
      continue;
    }

    try {
      await assertVehicleForService(serviceRow, vehicle);
    } catch (err) {
      const item = {
        line,
        status: "error",
        key: { plate: vehicle.plate },
        incoming: payload,
        message: err.message,
      };
      rows.push(item);
      sessionRows.push({
        ...item,
        existingId: vehicle.id_vehicle,
        alreadyLinked: false,
      });
      continue;
    }

    const alreadyLinked = await isVehicleLinked(id, vehicle.id_vehicle);
    const incoming = {
      plate: vehicle.plate,
      brand: payload.brand !== undefined ? payload.brand || null : vehicle.brand,
      model: payload.model !== undefined ? payload.model || null : vehicle.model,
      color: payload.color !== undefined ? payload.color || null : vehicle.color,
      type: payload.type !== undefined ? payload.type || null : vehicle.type,
      description:
        payload.description !== undefined ? payload.description || null : vehicle.description,
    };
    const existingPublic = {
      id_vehicle: vehicle.id_vehicle,
      plate: vehicle.plate,
      brand: vehicle.brand || null,
      model: vehicle.model || null,
      color: vehicle.color || null,
      type: vehicle.type || null,
      description: vehicle.description || null,
    };
    const diffs = buildFieldDiffs(existingPublic, incoming, SERVICE_VEHICLE_UPDATE_FIELDS);

    if (alreadyLinked && !diffs.length) {
      const item = {
        line,
        status: "error",
        key: { plate: vehicle.plate },
        incoming,
        existing: existingPublic,
        message: "Veículo já vinculado.",
      };
      rows.push(item);
      sessionRows.push({
        ...item,
        existingId: vehicle.id_vehicle,
        alreadyLinked: true,
      });
      continue;
    }

    const status = diffs.length ? "update" : "link";
    const item = {
      line,
      status,
      key: { plate: vehicle.plate },
      incoming,
      existing: existingPublic,
      diffs,
      alreadyLinked,
      message: alreadyLinked
        ? "Já vinculado — apenas atualização cadastral."
        : diffs.length
          ? "Atualizar cadastro e vincular ao acesso."
          : "Vincular veículo existente.",
    };
    rows.push(item);
    sessionRows.push({
      ...item,
      existingId: vehicle.id_vehicle,
      alreadyLinked,
    });
  }

  if (!rows.length) {
    throw new AppError(
      "Nenhuma linha de dados encontrada. Cabeçalho: plate, brand, model, color, type, description.",
      400,
    );
  }

  const previewId = savePreviewSession({
    kind: "service_vehicles",
    serviceId: Number(id),
    userId: req.user?.id || null,
    rows: sessionRows,
  });

  return {
    previewId,
    summary: summarizePreviewRows(rows),
    rows,
    updateFields: SERVICE_VEHICLE_UPDATE_FIELDS,
  };
}

async function commitBulkServiceVehicles(req, id, { previewId, decisions }) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);

  const session = getPreviewSession(previewId, "service_vehicles");
  if (Number(session.serviceId) !== Number(id)) {
    throw new AppError("Pré-visualização de outro acesso de serviço.", 400);
  }

  const byLine = new Map(session.rows.map((r) => [r.line, r]));
  const decisionList = Array.isArray(decisions) ? decisions : [];
  const errors = [];
  let created = 0;
  let updated = 0;
  let linked = 0;
  let skipped = 0;

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
        const vehicle = await createVehicleRecordForService(serviceRow, row.incoming);
        await linkVehicleToService(id, vehicle.id_vehicle);
        created += 1;
        linked += 1;
      } else if (action === "update") {
        if (!row.existingId) {
          errors.push({ line, reason: "Sem veículo existente." });
          continue;
        }
        const patch = pickUpdatePatch(row.incoming || {}, decision.fields, SERVICE_VEHICLE_UPDATE_FIELDS);
        if (Object.keys(patch).length) {
          await vehicleService.applyVehicleFieldPatch(row.existingId, patch);
          updated += 1;
        }
        if (!row.alreadyLinked) {
          await linkVehicleToService(id, row.existingId);
          linked += 1;
        }
      } else if (action === "link") {
        if (!row.existingId) {
          errors.push({ line, reason: "Sem veículo existente." });
          continue;
        }
        if (row.alreadyLinked) {
          skipped += 1;
          continue;
        }
        await linkVehicleToService(id, row.existingId);
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
  if (created + updated + linked > 0) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await reopenServiceAccessForApproval(conn, serviceRow);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
  return { created, updated, linked, skipped, errors, totalDecisions: decisionList.length };
}

async function getUnifiedBulkImportTemplate() {
  const bulkImport = require("./service-access-bulk-import");
  return bulkImport.buildUnifiedTemplate();
}

async function previewUnifiedBulkImport(req, id, file) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);
  const flow = require("./service-access-bulk-import.flow");
  return flow.previewUnifiedBulkImport({
    serviceId: Number(id),
    serviceRow,
    file,
    userId: req.user?.id || null,
  });
}

async function confirmUnifiedBulkImport(req, id, body) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);
  const previewToken = body?.previewToken || body?.previewId;
  if (!previewToken) throw new AppError("previewToken obrigatório.", 400);
  const flow = require("./service-access-bulk-import.flow");
  const result = await flow.confirmUnifiedBulkImport({
    serviceId: Number(id),
    serviceRow,
    previewToken,
    decisoes: body?.decisoes || body?.decisions || {},
    userId: req.user?.id || null,
  });

  // Em rascunho (wizard), não reabre/cria aprovação — isso ocorre só no envio final.
  if (body?.notify_approvers === false) {
    return result;
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await reopenServiceAccessForApproval(conn, serviceRow);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return result;
}

/**
 * Substitui a lista de colaboradores/veículos em uma única transação.
 * Reabre aprovação uma vez e sinaliza approvalNotify para o controller.
 */
async function syncServiceAccessRelations(req, id, data) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);

  const desiredCollab = Array.isArray(data.collaborators) ? data.collaborators : [];
  const desiredVeh = Array.isArray(data.vehicles) ? data.vehicles : [];

  const seenCollab = new Set();
  for (const item of desiredCollab) {
    const idCollaborator = Number(item.id_collaborator);
    if (seenCollab.has(idCollaborator)) {
      throw new AppError("Lista de colaboradores contém itens duplicados.", 400);
    }
    seenCollab.add(idCollaborator);
    await assertRoleExists(item.id_collaborator_role);
    const collaborator = await collaboratorService.findCollaboratorById(idCollaborator);
    if (!collaborator) {
      throw new AppError(`Colaborador #${idCollaborator} não encontrado.`, 404);
    }
    await assertCollaboratorForService(serviceRow, collaborator);
  }

  const seenVeh = new Set();
  for (const item of desiredVeh) {
    const idVehicle = Number(item.id_vehicle);
    if (seenVeh.has(idVehicle)) {
      throw new AppError("Lista de veículos contém itens duplicados.", 400);
    }
    seenVeh.add(idVehicle);
    const vehicle = await vehicleService.findVehicleById(idVehicle);
    if (!vehicle) {
      throw new AppError(`Veículo #${idVehicle} não encontrado.`, 404);
    }
    await assertVehicleForService(serviceRow, vehicle);
  }

  const currentCollab = await loadServiceCollaborators(id);
  const currentVeh = await loadServiceVehicles(id);

  const desiredRoleByCollab = new Map(
    desiredCollab.map((c) => [Number(c.id_collaborator), Number(c.id_collaborator_role)]),
  );
  const desiredVehSet = new Set(desiredVeh.map((v) => Number(v.id_vehicle)));

  const toRemoveCollab = currentCollab.filter(
    (c) => !desiredRoleByCollab.has(Number(c.id_collaborator)),
  );
  const toAddCollab = desiredCollab.filter(
    (c) =>
      !currentCollab.some((x) => Number(x.id_collaborator) === Number(c.id_collaborator)),
  );
  const toUpdateRole = desiredCollab.filter((c) => {
    const cur = currentCollab.find(
      (x) => Number(x.id_collaborator) === Number(c.id_collaborator),
    );
    return cur && Number(cur.id_collaborator_role) !== Number(c.id_collaborator_role);
  });
  const toRemoveVeh = currentVeh.filter((v) => !desiredVehSet.has(Number(v.id_vehicle)));
  const toAddVeh = desiredVeh.filter(
    (v) => !currentVeh.some((x) => Number(x.id_vehicle) === Number(v.id_vehicle)),
  );

  const relationsChanged =
    toRemoveCollab.length > 0 ||
    toAddCollab.length > 0 ||
    toUpdateRole.length > 0 ||
    toRemoveVeh.length > 0 ||
    toAddVeh.length > 0;

  const submitForApproval = data.notify_approvers === true;
  const idSetor =
    data.id_setor != null ? Number(data.id_setor) : serviceRow.id_setor || null;

  // Inclusões novas sempre; no envio à aprovação, revalida a lista inteira.
  const collabsToValidate = submitForApproval ? desiredCollab : toAddCollab;
  for (const c of collabsToValidate) {
    await assertNoOverlappingServiceCollaborator(
      c.id_collaborator,
      serviceRow.start_date,
      serviceRow.end_date,
      id,
    );
  }

  if (!relationsChanged && !submitForApproval) {
    const detail = await getServiceAccessById(req, id);
    return { ...detail, relationsChanged: false, approvalNotify: false };
  }

  const status = Number(serviceRow.id_access_status);
  const conn = await db.getConnection();
  let reopenResult = { reopened: false, created: false, idAprovacao: null };
  try {
    await conn.beginTransaction();

    for (const c of toRemoveCollab) {
      await conn.execute(
        `DELETE FROM service_access_collaborator
          WHERE id_service_access_collaborator = ? AND id_service_access = ?`,
        [c.id_service_access_collaborator, id],
      );
    }
    for (const c of toAddCollab) {
      await conn.execute(
        `INSERT INTO service_access_collaborator
           (id_service_access, id_collaborator, id_collaborator_role)
         VALUES (?, ?, ?)`,
        [id, c.id_collaborator, c.id_collaborator_role],
      );
    }
    for (const c of toUpdateRole) {
      await conn.execute(
        `UPDATE service_access_collaborator
            SET id_collaborator_role = ?
          WHERE id_service_access = ? AND id_collaborator = ?`,
        [c.id_collaborator_role, id, c.id_collaborator],
      );
    }
    for (const v of toRemoveVeh) {
      await conn.execute(
        `DELETE FROM service_access_vehicle
          WHERE id_service_access_vehicle = ? AND id_service_access = ?`,
        [v.id_service_access_vehicle, id],
      );
    }
    for (const v of toAddVeh) {
      await conn.execute(
        `INSERT INTO service_access_vehicle (id_service_access, id_vehicle)
         VALUES (?, ?)`,
        [id, v.id_vehicle],
      );
    }

    reopenResult = await reopenServiceAccessForApproval(conn, serviceRow, {
      force:
        submitForApproval ||
        status === STATUS_APROVADO ||
        status === STATUS_NEGADO,
      idSetor: idSetor || undefined,
      idSolicitante: req.user?.id || serviceRow.id_usuario || null,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const detail = await getServiceAccessById(req, id);
  const idAprovacao = detail.id_aprovacao || reopenResult.idAprovacao || null;
  return {
    ...detail,
    relationsChanged,
    approvalNotify: submitForApproval && !!idAprovacao,
    id_aprovacao: idAprovacao,
  };
}

async function deleteDraftServiceAccess(req, id) {
  assertCanManageServices(req);
  const serviceRow = await getServiceAccessRow(id);
  if (!serviceRow) throw new AppError("Acesso de serviço não encontrado.", 404);
  await assertServiceInScope(req, serviceRow);

  const status = Number(serviceRow.id_access_status);
  if (status !== STATUS_AGUARDANDO_PRODUTORA) {
    throw new AppError(
      "Somente rascunhos (não enviados para aprovação) podem ser descartados.",
      409,
    );
  }

  const [pending] = await db.execute(
    `SELECT id FROM aprovacoes
      WHERE tipo_entidade = 'ACESSO_SERVICO' AND id_entidade = ? AND status = 'PENDENTE'
      LIMIT 1`,
    [id],
  );
  if (pending.length) {
    throw new AppError("Não é possível descartar: já existe aprovação pendente.", 409);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM service_access_collaborator WHERE id_service_access = ?`, [id]);
    await conn.execute(`DELETE FROM service_access_vehicle WHERE id_service_access = ?`, [id]);
    await conn.execute(`DELETE FROM service_access WHERE id_service_access = ?`, [id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return { deleted: true, id_service_access: Number(id) };
}

module.exports = {
  listServiceAccess,
  getServiceAccessById,
  createServiceAccess,
  deleteDraftServiceAccess,
  updateServiceAccess,
  updateServiceAccessPeriod,
  updateServiceAccessStatus,
  toggleServiceAccessEnabled,
  addCollaborator,
  removeCollaborator,
  bulkAddCollaborators,
  previewBulkServiceCollaborators,
  commitBulkServiceCollaborators,
  getCollaboratorsBulkTemplate,
  addVehicle,
  removeVehicle,
  bulkAddVehicles,
  previewBulkServiceVehicles,
  commitBulkServiceVehicles,
  getVehiclesBulkTemplate,
  syncServiceAccessRelations,
  markApproved,
  markRejected,
  getUnifiedBulkImportTemplate,
  previewUnifiedBulkImport,
  confirmUnifiedBulkImport,
  repairOrphanApprovals,
  assertNoOverlappingServiceCollaborator,
};
