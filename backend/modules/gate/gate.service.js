const db = require("../../config/db");
const env = require("../../config/env");
const { child } = require("../../config/logger");
const AppError = require("../../utils/AppError");
const { maskDocument } = require("../../utils/privacy");
const collaboratorService = require("../collaborators/collaborator.service");
const vehicleService = require("../patrimonial/vehicle.service");
const { STATUS_APROVADO } = require("../credentials/credentials.schema");
const { normalizePlate } = require("../../utils/plate");

const logger = child({ module: "gate" });

const GATE_CREDENTIAL_SELECT = `
  SELECT edcc.*,
         ast.description AS access_status_description,
         c.name AS collaborator_name,
         c.document AS collaborator_document,
         c.picture AS collaborator_picture,
         cdt.description AS document_type_description,
         cr.description AS role_description,
         sub.name AS substitute_name,
         sub.document AS substitute_document,
         sub.picture AS substitute_picture,
         sub_cdt.description AS substitute_document_type_description,
         co.fancy_name AS company_fancy_name,
         ed.date AS event_day_date,
         e.id_event,
         e.name AS event_name,
         bl.id_collaborator AS blacklisted_id
  FROM event_day_company_collaborator edcc
  INNER JOIN access_status ast ON ast.id_access_status = edcc.id_access_status
  INNER JOIN collaborator c ON c.id_collaborator = edcc.id_collaborator
  INNER JOIN collaborator_document_type cdt
    ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
  INNER JOIN collaborator_role cr ON cr.id_collaborator_role = edcc.id_collaborator_role
  LEFT JOIN collaborator sub ON sub.id_collaborator = edcc.id_substitute
  LEFT JOIN collaborator_document_type sub_cdt
    ON sub_cdt.id_collaborator_document_type = sub.id_collaborator_document_type
  INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
  INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
  INNER JOIN event e ON e.id_event = ed.id_event
  INNER JOIN company co ON co.id_company = edc.id_company
  LEFT JOIN collaborator_black_list bl
    ON bl.id_collaborator = COALESCE(edcc.id_substitute, edcc.id_collaborator)
  WHERE edcc.access_id = ?
  LIMIT 1
`;

const DENIAL_MESSAGES = {
  CREDENTIAL_NOT_FOUND: "Credencial não encontrada.",
  CREDENTIAL_NOT_APPROVED: "Credencial não aprovada.",
  INVALID_DATE_WINDOW: "Data incorreta para este credenciamento.",
  BLACK_LIST_BLOCKED: "Colaborador consta na lista de bloqueio de segurança da arena.",
  ACCESS_ALREADY_COMPLETED: "Entrada e saída já registradas para esta credencial.",
};

function buildDenial(errorCode, statusCode = 403) {
  return {
    allowed: false,
    statusCode,
    error_code: errorCode,
    reason: DENIAL_MESSAGES[errorCode] || "Acesso negado.",
  };
}

function getGateToleranceHours() {
  return env.gateAccessToleranceHours;
}

/** Fragmento SQL: event_day dentro da janela operacional (hoje ± tolerância). */
const EVENT_DAY_WINDOW_SQL = `
  NOW() BETWEEN DATE_SUB(CONCAT(ed.date, ' 00:00:00'), INTERVAL ? HOUR)
            AND DATE_ADD(CONCAT(ed.date, ' 23:59:59'), INTERVAL ? HOUR)
`;

function eventDayWindowParams() {
  const tolerance = getGateToleranceHours();
  return [tolerance, tolerance];
}

function isWithinEventDayWindow(eventDayDate) {
  const tolerance = getGateToleranceHours();
  const dayStr = String(eventDayDate).slice(0, 10);
  const windowStart = new Date(`${dayStr}T00:00:00`);
  const windowEnd = new Date(`${dayStr}T23:59:59`);
  windowStart.setHours(windowStart.getHours() - tolerance);
  windowEnd.setHours(windowEnd.getHours() + tolerance);
  const now = new Date();
  return now >= windowStart && now <= windowEnd;
}

function resolveEffectiveCollaborator(row) {
  if (row.id_substitute) {
    return {
      name: row.substitute_name,
      document: row.substitute_document,
      documentType: row.substitute_document_type_description,
      picture: row.substitute_picture || null,
    };
  }
  return {
    name: row.collaborator_name,
    document: row.collaborator_document,
    documentType: row.document_type_description,
    picture: row.collaborator_picture || null,
  };
}

function buildSuccessPayload(row, actionRegistered) {
  const effective = resolveEffectiveCollaborator(row);
  return {
    allowed: true,
    data: {
      access_allowed: true,
      type: "EVENT",
      collaborator: {
        name: effective.name,
        document_masked: maskDocument(effective.document, effective.documentType),
        role: row.role_description,
        picture: effective.picture || null,
      },
      company: {
        fancy_name: row.company_fancy_name,
      },
      action_registered: actionRegistered,
      access_id: row.access_id,
      id_event_day_company_collaborator: row.id_event_day_company_collaborator,
      id_event: row.id_event,
      event_name: row.event_name,
    },
  };
}

async function findCredentialByAccessId(accessId) {
  const [rows] = await db.execute(GATE_CREDENTIAL_SELECT, [accessId]);
  return rows[0] || null;
}

function validateCredentialRow(row) {
  if (!row) {
    return buildDenial("CREDENTIAL_NOT_FOUND", 404);
  }
  if (Number(row.id_access_status) !== STATUS_APROVADO) {
    return buildDenial("CREDENTIAL_NOT_APPROVED");
  }
  if (!isWithinEventDayWindow(row.event_day_date)) {
    return buildDenial("INVALID_DATE_WINDOW");
  }
  if (row.blacklisted_id != null) {
    return {
      ...buildDenial("BLACK_LIST_BLOCKED"),
      critical: true,
      id_collaborator: row.id_substitute || row.id_collaborator,
      credentialId: row.id_event_day_company_collaborator,
    };
  }
  return null;
}

function resolveNextAction(row) {
  if (!row.access_check_in) return "CHECK_IN";
  if (!row.access_check_out) return "CHECK_OUT";
  return null;
}

function resolveNextActionLabel(row) {
  const action = resolveNextAction(row);
  return action || "COMPLETED";
}

function mapTodayCredentialRow(row) {
  const effective = resolveEffectiveCollaborator(row);
  const nextAction = resolveNextActionLabel(row);
  return {
    id: row.id_event_day_company_collaborator,
    access_id: row.access_id,
    collaborator: {
      name: effective.name,
      document_masked: maskDocument(effective.document, effective.documentType),
      role: row.role_description,
      picture: effective.picture || null,
    },
    company: {
      name: row.company_fancy_name,
    },
    event_name: row.event_name,
    access_check_in: row.access_check_in || null,
    access_check_out: row.access_check_out || null,
    next_action: nextAction,
  };
}

const GATE_TODAY_LIST_SELECT = `
  SELECT edcc.id_event_day_company_collaborator,
         edcc.access_id,
         edcc.id_substitute,
         edcc.access_check_in,
         edcc.access_check_out,
         c.name AS collaborator_name,
         c.document AS collaborator_document,
         c.picture AS collaborator_picture,
         cdt.description AS document_type_description,
         cr.description AS role_description,
         sub.name AS substitute_name,
         sub.document AS substitute_document,
         sub.picture AS substitute_picture,
         sub_cdt.description AS substitute_document_type_description,
         co.fancy_name AS company_fancy_name,
         e.name AS event_name
  FROM event_day_company_collaborator edcc
  INNER JOIN collaborator c ON c.id_collaborator = edcc.id_collaborator
  INNER JOIN collaborator_document_type cdt
    ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
  INNER JOIN collaborator_role cr ON cr.id_collaborator_role = edcc.id_collaborator_role
  LEFT JOIN collaborator sub ON sub.id_collaborator = edcc.id_substitute
  LEFT JOIN collaborator_document_type sub_cdt
    ON sub_cdt.id_collaborator_document_type = sub.id_collaborator_document_type
  INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
  INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
  INNER JOIN event e ON e.id_event = ed.id_event
  INNER JOIN company co ON co.id_company = edc.id_company
  WHERE edcc.id_access_status = ?
    AND e.id_access_status = ?
    AND edcc.access_id IS NOT NULL
    AND ${EVENT_DAY_WINDOW_SQL.trim()}
  ORDER BY COALESCE(sub.name, c.name) ASC, e.name ASC
`;

async function listTodayExpectedCredentials() {
  const params = [STATUS_APROVADO, STATUS_APROVADO, ...eventDayWindowParams()];
  const [rows] = await db.execute(GATE_TODAY_LIST_SELECT, params);
  return rows.map(mapTodayCredentialRow);
}

async function validateEventAccess(accessId) {
  const row = await findCredentialByAccessId(accessId);
  const denial = validateCredentialRow(row);
  if (denial) {
    logger.warn({ accessId, error_code: denial.error_code }, "Acesso negado na portaria");
    return denial;
  }

  const action = resolveNextAction(row);
  if (!action) {
    logger.warn({ accessId }, "Credencial com fluxo já concluído");
    return buildDenial("ACCESS_ALREADY_COMPLETED");
  }

  const column = action === "CHECK_IN" ? "access_check_in" : "access_check_out";
  await db.execute(
    `UPDATE event_day_company_collaborator SET ${column} = NOW() WHERE id_event_day_company_collaborator = ?`,
    [row.id_event_day_company_collaborator],
  );

  const updated = await findCredentialByAccessId(accessId);
  logger.info(
    { accessId, action, credentialId: row.id_event_day_company_collaborator },
    "Fluxo de portaria registrado",
  );
  return buildSuccessPayload(updated, action);
}

async function substituteEventCollaborator(accessId, idSubstituteCollaborator) {
  const row = await findCredentialByAccessId(accessId);
  if (!row) {
    return buildDenial("CREDENTIAL_NOT_FOUND", 404);
  }
  if (Number(row.id_access_status) !== STATUS_APROVADO) {
    return buildDenial("CREDENTIAL_NOT_APPROVED");
  }
  if (!isWithinEventDayWindow(row.event_day_date)) {
    return buildDenial("INVALID_DATE_WINDOW");
  }

  const substituteRow = await collaboratorService.findCollaboratorById(idSubstituteCollaborator);
  if (!substituteRow) {
    throw new AppError("Colaborador substituto não encontrado.", 404);
  }
  if (!substituteRow.status) {
    throw new AppError("Colaborador substituto está inativo.", 400);
  }
  const isBlacklisted = await collaboratorService.checkBlacklist(idSubstituteCollaborator);
  if (isBlacklisted) {
    throw new AppError("Colaborador substituto consta na lista de bloqueio.", 400);
  }

  if (Number(idSubstituteCollaborator) === Number(row.id_collaborator)) {
    throw new AppError("Selecione um colaborador diferente do titular da credencial.", 400);
  }

  await db.execute(
    `UPDATE event_day_company_collaborator SET id_substitute = ? WHERE id_event_day_company_collaborator = ?`,
    [idSubstituteCollaborator, row.id_event_day_company_collaborator],
  );

  const updated = await findCredentialByAccessId(accessId);
  const effective = resolveEffectiveCollaborator(updated);

  logger.info(
    {
      accessId,
      credentialId: row.id_event_day_company_collaborator,
      id_substitute: idSubstituteCollaborator,
    },
    "Substituição de colaborador na portaria",
  );

  return {
    allowed: true,
    data: {
      access_id: accessId,
      id_event_day_company_collaborator: row.id_event_day_company_collaborator,
      id_substitute_collaborator: idSubstituteCollaborator,
      substitute: {
        name: effective.name,
        document_masked: maskDocument(effective.document, effective.documentType),
      },
    },
  };
}

const SERVICE_VEHICLE_SELECT = `
  SELECT sav.*,
         sa.id_service_access,
         sa.id_company,
         sa.id_access_status,
         sa.status AS service_enabled,
         sa.start_date,
         sa.end_date,
         COALESCE(sa.finalidade, sa.service_type) AS finalidade,
         ast.description AS access_status_description,
         v.plate AS vehicle_plate,
         v.description AS vehicle_description,
         sub.plate AS substitute_plate,
         co.fancy_name AS company_fancy_name,
         bl_main.id_vehicle AS main_blacklisted_id,
         bl_sub.id_vehicle AS sub_blacklisted_id
  FROM service_access_vehicle sav
  INNER JOIN service_access sa ON sa.id_service_access = sav.id_service_access
  INNER JOIN access_status ast ON ast.id_access_status = sa.id_access_status
  INNER JOIN vehicle v ON v.id_vehicle = sav.id_vehicle
  INNER JOIN company co ON co.id_company = sa.id_company
  LEFT JOIN vehicle sub ON sub.id_vehicle = sav.id_substitute_vehicle
  LEFT JOIN vehicle_black_list bl_main ON bl_main.id_vehicle = v.id_vehicle
  LEFT JOIN vehicle_black_list bl_sub ON bl_sub.id_vehicle = sav.id_substitute_vehicle
  WHERE sav.access_id = ?
  LIMIT 1
`;

const SERVICE_COLLABORATOR_SELECT = `
  SELECT sac.*,
         sa.id_service_access,
         sa.id_company,
         sa.id_access_status,
         sa.status AS service_enabled,
         sa.start_date,
         sa.end_date,
         COALESCE(sa.finalidade, sa.service_type) AS finalidade,
         ast.description AS access_status_description,
         c.name AS collaborator_name,
         c.document AS collaborator_document,
         c.picture AS collaborator_picture,
         cdt.description AS document_type_description,
         cr.description AS role_description,
         sub.name AS substitute_name,
         sub.document AS substitute_document,
         sub.picture AS substitute_picture,
         sub_cdt.description AS substitute_document_type_description,
         co.fancy_name AS company_fancy_name,
         bl_main.id_collaborator AS main_blacklisted_id,
         bl_sub.id_collaborator AS sub_blacklisted_id
  FROM service_access_collaborator sac
  INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
  INNER JOIN access_status ast ON ast.id_access_status = sa.id_access_status
  INNER JOIN collaborator c ON c.id_collaborator = sac.id_collaborator
  INNER JOIN collaborator_document_type cdt
    ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
  INNER JOIN collaborator_role cr ON cr.id_collaborator_role = sac.id_collaborator_role
  LEFT JOIN collaborator sub ON sub.id_collaborator = sac.id_substitute
  LEFT JOIN collaborator_document_type sub_cdt
    ON sub_cdt.id_collaborator_document_type = sub.id_collaborator_document_type
  INNER JOIN company co ON co.id_company = sa.id_company
  LEFT JOIN collaborator_black_list bl_main ON bl_main.id_collaborator = c.id_collaborator
  LEFT JOIN collaborator_black_list bl_sub ON bl_sub.id_collaborator = sac.id_substitute
  WHERE sac.access_id = ?
  LIMIT 1
`;

const SERVICE_DENIAL_MESSAGES = {
  SERVICE_NOT_FOUND: "Acesso de serviço não encontrado.",
  SERVICE_NOT_APPROVED: "Solicitação de serviço não aprovada.",
  SERVICE_DISABLED: "Acesso de serviço desabilitado.",
  INVALID_SERVICE_DATE: "Data não autorizada para este serviço.",
  SERVICE_ACCESS_COMPLETED: "Entrada e saída já registradas.",
  VEHICLE_BLACK_LIST_BLOCKED: "Veículo consta na lista de bloqueio de segurança da arena.",
  COLLABORATOR_BLACK_LIST_BLOCKED: "Colaborador consta na lista de bloqueio de segurança da arena.",
};

function buildServiceDenial(errorCode, statusCode = 403) {
  return {
    allowed: false,
    statusCode,
    error_code: errorCode,
    reason: SERVICE_DENIAL_MESSAGES[errorCode] || "Acesso negado.",
  };
}

async function findServiceVehicleByAccessId(accessId) {
  const [rows] = await db.execute(SERVICE_VEHICLE_SELECT, [accessId]);
  return rows[0] || null;
}

async function findServiceCollaboratorByAccessId(accessId) {
  const [rows] = await db.execute(SERVICE_COLLABORATOR_SELECT, [accessId]);
  return rows[0] || null;
}

async function isServiceDateAllowed(serviceRow) {
  if (!serviceRow) return false;
  const [rows] = await db.execute(
    `SELECT 1 FROM service_access
     WHERE id_service_access = ?
       AND status = 1
       AND CURDATE() BETWEEN start_date AND end_date
     LIMIT 1`,
    [serviceRow.id_service_access],
  );
  return rows.length > 0;
}

/** Calendar day key (YYYY-MM-DD). With mysql2 dateStrings, DATETIME arrives as string. */
function toDateKey(value) {
  if (value == null) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getMysqlTodayKey() {
  const [rows] = await db.execute(`SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d`);
  return rows[0]?.d || null;
}

function isTimestampToday(value, todayKey) {
  if (!value || !todayKey) return false;
  return toDateKey(value) === todayKey;
}

function validateServiceAccessBase(row) {
  if (!row) return buildServiceDenial("SERVICE_NOT_FOUND", 404);
  if (Number(row.id_access_status) !== STATUS_APROVADO) {
    return buildServiceDenial("SERVICE_NOT_APPROVED");
  }
  if (!row.service_enabled) {
    return buildServiceDenial("SERVICE_DISABLED");
  }
  return null;
}

function resolveEffectiveVehicle(row) {
  if (row.id_substitute_vehicle) {
    return { plate: row.substitute_plate };
  }
  return { plate: row.vehicle_plate };
}

function resolveEffectiveServiceCollaborator(row) {
  if (row.id_substitute) {
    return {
      name: row.substitute_name,
      document: row.substitute_document,
      documentType: row.substitute_document_type_description,
      picture: row.substitute_picture || null,
    };
  }
  return {
    name: row.collaborator_name,
    document: row.collaborator_document,
    documentType: row.document_type_description,
    picture: row.collaborator_picture || null,
  };
}

function resolveServiceVehicleNextAction(row, todayKey) {
  if (!isTimestampToday(row.check_in, todayKey)) return "CHECK_IN";
  if (!isTimestampToday(row.check_out, todayKey)) return "CHECK_OUT";
  return null;
}

function resolveServiceCollaboratorNextAction(row, todayKey) {
  if (!isTimestampToday(row.access_check_in, todayKey)) return "CHECK_IN";
  if (!isTimestampToday(row.access_check_out, todayKey)) return "CHECK_OUT";
  return null;
}

function mapTodayServiceVehicleRow(row, todayKey) {
  const effective = resolveEffectiveVehicle(row);
  const next = resolveServiceVehicleNextAction(row, todayKey);
  const checkInToday = isTimestampToday(row.check_in, todayKey) ? row.check_in : null;
  const checkOutToday = isTimestampToday(row.check_out, todayKey) ? row.check_out : null;
  return {
    kind: "vehicle",
    id: row.id_service_access_vehicle,
    access_id: row.access_id,
    vehicle: {
      plate: effective.plate,
      description: row.vehicle_description,
    },
    company: { name: row.company_fancy_name },
    finalidade: row.finalidade,
    check_in: checkInToday,
    check_out: checkOutToday,
    next_action: next || "COMPLETED",
  };
}

function mapTodayServiceCollaboratorRow(row, todayKey) {
  const effective = resolveEffectiveServiceCollaborator(row);
  const next = resolveServiceCollaboratorNextAction(row, todayKey);
  const checkInToday = isTimestampToday(row.access_check_in, todayKey)
    ? row.access_check_in
    : null;
  const checkOutToday = isTimestampToday(row.access_check_out, todayKey)
    ? row.access_check_out
    : null;
  return {
    kind: "collaborator",
    id: row.id_service_access_collaborator,
    access_id: row.access_id,
    collaborator: {
      name: effective.name,
      document_masked: maskDocument(effective.document, effective.documentType),
      role: row.role_description,
      picture: effective.picture || null,
    },
    company: { name: row.company_fancy_name },
    finalidade: row.finalidade,
    check_in: checkInToday,
    check_out: checkOutToday,
    next_action: next || "COMPLETED",
  };
}

const GATE_TODAY_SERVICE_VEHICLES_SELECT = `
  SELECT sav.id_service_access_vehicle,
         sav.access_id,
         sav.check_in,
         sav.check_out,
         sav.id_substitute_vehicle,
         COALESCE(sa.finalidade, sa.service_type) AS finalidade,
         v.plate AS vehicle_plate,
         v.description AS vehicle_description,
         sub.plate AS substitute_plate,
         co.fancy_name AS company_fancy_name
  FROM service_access_vehicle sav
  INNER JOIN service_access sa ON sa.id_service_access = sav.id_service_access
  INNER JOIN vehicle v ON v.id_vehicle = sav.id_vehicle
  INNER JOIN company co ON co.id_company = sa.id_company
  LEFT JOIN vehicle sub ON sub.id_vehicle = sav.id_substitute_vehicle
  WHERE sa.id_access_status = ?
    AND sa.status = 1
    AND sav.access_id IS NOT NULL
    AND CURDATE() BETWEEN sa.start_date AND sa.end_date
  ORDER BY COALESCE(sub.plate, v.plate) ASC
`;

const GATE_TODAY_SERVICE_COLLABORATORS_SELECT = `
  SELECT sac.id_service_access_collaborator,
         sac.access_id,
         sac.access_check_in,
         sac.access_check_out,
         sac.id_substitute,
         COALESCE(sa.finalidade, sa.service_type) AS finalidade,
         c.name AS collaborator_name,
         c.document AS collaborator_document,
         c.picture AS collaborator_picture,
         cdt.description AS document_type_description,
         cr.description AS role_description,
         sub.name AS substitute_name,
         sub.document AS substitute_document,
         sub.picture AS substitute_picture,
         sub_cdt.description AS substitute_document_type_description,
         co.fancy_name AS company_fancy_name
  FROM service_access_collaborator sac
  INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
  INNER JOIN collaborator c ON c.id_collaborator = sac.id_collaborator
  INNER JOIN collaborator_document_type cdt
    ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
  INNER JOIN collaborator_role cr ON cr.id_collaborator_role = sac.id_collaborator_role
  LEFT JOIN collaborator sub ON sub.id_collaborator = sac.id_substitute
  LEFT JOIN collaborator_document_type sub_cdt
    ON sub_cdt.id_collaborator_document_type = sub.id_collaborator_document_type
  INNER JOIN company co ON co.id_company = sa.id_company
  WHERE sa.id_access_status = ?
    AND sa.status = 1
    AND sac.access_id IS NOT NULL
    AND CURDATE() BETWEEN sa.start_date AND sa.end_date
  ORDER BY COALESCE(sub.name, c.name) ASC
`;

async function listTodayExpectedServices() {
  const [todayKey, vehicleResult, collaboratorResult] = await Promise.all([
    getMysqlTodayKey(),
    db.execute(GATE_TODAY_SERVICE_VEHICLES_SELECT, [STATUS_APROVADO]),
    db.execute(GATE_TODAY_SERVICE_COLLABORATORS_SELECT, [STATUS_APROVADO]),
  ]);
  const vehicles = vehicleResult[0].map((row) => mapTodayServiceVehicleRow(row, todayKey));
  const collaborators = collaboratorResult[0].map((row) =>
    mapTodayServiceCollaboratorRow(row, todayKey),
  );
  return [...vehicles, ...collaborators];
}

function buildServiceVehicleSuccessPayload(row, actionRegistered) {
  const effective = resolveEffectiveVehicle(row);
  return {
    allowed: true,
    data: {
      access_allowed: true,
      type: "SERVICE",
      kind: "vehicle",
      vehicle: {
        plate: normalizePlate(effective.plate),
        description: row.vehicle_description,
      },
      company: { fancy_name: row.company_fancy_name },
      action_registered: actionRegistered,
      access_id: row.access_id,
      id_service_access: row.id_service_access,
      id_service_access_vehicle: row.id_service_access_vehicle,
      finalidade: row.finalidade,
    },
  };
}

function buildServiceCollaboratorSuccessPayload(row, actionRegistered) {
  const effective = resolveEffectiveServiceCollaborator(row);
  return {
    allowed: true,
    data: {
      access_allowed: true,
      type: "SERVICE",
      kind: "collaborator",
      collaborator: {
        name: effective.name,
        document_masked: maskDocument(effective.document, effective.documentType),
        role: row.role_description,
        picture: effective.picture || null,
      },
      company: { fancy_name: row.company_fancy_name },
      action_registered: actionRegistered,
      access_id: row.access_id,
      id_service_access: row.id_service_access,
      id_service_access_collaborator: row.id_service_access_collaborator,
      finalidade: row.finalidade,
    },
  };
}

async function validateServiceVehicleAccess(accessId) {
  const row = await findServiceVehicleByAccessId(accessId);
  const denial = validateServiceAccessBase(row);
  if (denial) return denial;
  if (!(await isServiceDateAllowed(row))) {
    return buildServiceDenial("INVALID_SERVICE_DATE");
  }

  const blacklisted = row.id_substitute_vehicle
    ? row.sub_blacklisted_id != null
    : row.main_blacklisted_id != null;
  if (blacklisted) {
    return {
      ...buildServiceDenial("VEHICLE_BLACK_LIST_BLOCKED"),
      critical: true,
    };
  }

  const todayKey = await getMysqlTodayKey();
  const action = resolveServiceVehicleNextAction(row, todayKey);
  if (!action) {
    return buildServiceDenial("SERVICE_ACCESS_COMPLETED");
  }

  if (action === "CHECK_IN") {
    await db.execute(
      `UPDATE service_access_vehicle
       SET check_in = NOW(), check_out = NULL
       WHERE id_service_access_vehicle = ?`,
      [row.id_service_access_vehicle],
    );
  } else {
    await db.execute(
      `UPDATE service_access_vehicle SET check_out = NOW() WHERE id_service_access_vehicle = ?`,
      [row.id_service_access_vehicle],
    );
  }

  const updated = await findServiceVehicleByAccessId(accessId);
  logger.info(
    { accessId, action, id: row.id_service_access_vehicle, kind: "vehicle" },
    "Fluxo patrimonial registrado na portaria",
  );
  return buildServiceVehicleSuccessPayload(updated, action);
}

async function validateServiceCollaboratorAccess(accessId) {
  const row = await findServiceCollaboratorByAccessId(accessId);
  const denial = validateServiceAccessBase(row);
  if (denial) return denial;
  if (!(await isServiceDateAllowed(row))) {
    return buildServiceDenial("INVALID_SERVICE_DATE");
  }

  const blacklisted = row.id_substitute
    ? row.sub_blacklisted_id != null
    : row.main_blacklisted_id != null;
  if (blacklisted) {
    return {
      ...buildServiceDenial("COLLABORATOR_BLACK_LIST_BLOCKED"),
      critical: true,
      id_collaborator: row.id_substitute || row.id_collaborator,
    };
  }

  const todayKey = await getMysqlTodayKey();
  const action = resolveServiceCollaboratorNextAction(row, todayKey);
  if (!action) {
    return buildServiceDenial("SERVICE_ACCESS_COMPLETED");
  }

  if (action === "CHECK_IN") {
    await db.execute(
      `UPDATE service_access_collaborator
       SET access_check_in = NOW(), access_check_out = NULL
       WHERE id_service_access_collaborator = ?`,
      [row.id_service_access_collaborator],
    );
  } else {
    await db.execute(
      `UPDATE service_access_collaborator
       SET access_check_out = NOW()
       WHERE id_service_access_collaborator = ?`,
      [row.id_service_access_collaborator],
    );
  }

  const updated = await findServiceCollaboratorByAccessId(accessId);
  logger.info(
    { accessId, action, id: row.id_service_access_collaborator, kind: "collaborator" },
    "Fluxo patrimonial registrado na portaria",
  );
  return buildServiceCollaboratorSuccessPayload(updated, action);
}

async function validateServiceAccess(accessId) {
  const vehicleRow = await findServiceVehicleByAccessId(accessId);
  if (vehicleRow) {
    return validateServiceVehicleAccess(accessId);
  }
  const collaboratorRow = await findServiceCollaboratorByAccessId(accessId);
  if (collaboratorRow) {
    return validateServiceCollaboratorAccess(accessId);
  }
  return buildServiceDenial("SERVICE_NOT_FOUND", 404);
}

async function substituteServiceVehicle(accessId, idSubstituteVehicle) {
  const row = await findServiceVehicleByAccessId(accessId);
  const denial = validateServiceAccessBase(row);
  if (denial) return denial;
  if (!(await isServiceDateAllowed(row))) {
    return buildServiceDenial("INVALID_SERVICE_DATE");
  }

  const substitute = await vehicleService.findVehicleById(idSubstituteVehicle);
  if (!substitute || !substitute.status) {
    throw new AppError("Veículo substituto inválido ou inativo.", 400);
  }
  if (substitute.id_company !== row.id_company) {
    throw new AppError("Veículo substituto deve ser da mesma empresa.", 400);
  }
  if (Number(idSubstituteVehicle) === Number(row.id_vehicle)) {
    throw new AppError("Selecione um veículo diferente do titular.", 400);
  }
  if (await vehicleService.checkVehicleBlacklist(idSubstituteVehicle)) {
    throw new AppError("Veículo substituto consta na lista de restrição.", 400);
  }

  await db.execute(
    `UPDATE service_access_vehicle SET id_substitute_vehicle = ? WHERE id_service_access_vehicle = ?`,
    [idSubstituteVehicle, row.id_service_access_vehicle],
  );

  const updated = await findServiceVehicleByAccessId(accessId);
  const effective = resolveEffectiveVehicle(updated);

  return {
    allowed: true,
    data: {
      access_id: accessId,
      kind: "vehicle",
      id_service_access_vehicle: row.id_service_access_vehicle,
      id_substitute_vehicle: idSubstituteVehicle,
      substitute: { plate: normalizePlate(effective.plate) },
    },
  };
}

async function substituteServiceCollaborator(accessId, idSubstituteCollaborator) {
  const row = await findServiceCollaboratorByAccessId(accessId);
  const denial = validateServiceAccessBase(row);
  if (denial) return denial;
  if (!(await isServiceDateAllowed(row))) {
    return buildServiceDenial("INVALID_SERVICE_DATE");
  }

  const substituteRow = await collaboratorService.findCollaboratorById(idSubstituteCollaborator);
  if (!substituteRow) {
    throw new AppError("Colaborador substituto não encontrado.", 404);
  }
  if (!substituteRow.status) {
    throw new AppError("Colaborador substituto está inativo.", 400);
  }
  if (await collaboratorService.checkBlacklist(idSubstituteCollaborator)) {
    throw new AppError("Colaborador substituto consta na lista de bloqueio.", 400);
  }
  if (Number(idSubstituteCollaborator) === Number(row.id_collaborator)) {
    throw new AppError("Selecione um colaborador diferente do titular.", 400);
  }

  await db.execute(
    `UPDATE service_access_collaborator SET id_substitute = ? WHERE id_service_access_collaborator = ?`,
    [idSubstituteCollaborator, row.id_service_access_collaborator],
  );

  const updated = await findServiceCollaboratorByAccessId(accessId);
  const effective = resolveEffectiveServiceCollaborator(updated);

  return {
    allowed: true,
    data: {
      access_id: accessId,
      kind: "collaborator",
      id_service_access_collaborator: row.id_service_access_collaborator,
      id_substitute_collaborator: idSubstituteCollaborator,
      substitute: {
        name: effective.name,
        document_masked: maskDocument(effective.document, effective.documentType),
      },
    },
  };
}

async function substituteServiceAccess(accessId, payload) {
  const vehicleRow = await findServiceVehicleByAccessId(accessId);
  if (vehicleRow) {
    if (!payload.id_substitute_vehicle) {
      throw new AppError("Informe o veículo substituto.", 400);
    }
    return substituteServiceVehicle(accessId, payload.id_substitute_vehicle);
  }

  const collaboratorRow = await findServiceCollaboratorByAccessId(accessId);
  if (collaboratorRow) {
    if (!payload.id_substitute_collaborator) {
      throw new AppError("Informe o colaborador substituto.", 400);
    }
    return substituteServiceCollaborator(accessId, payload.id_substitute_collaborator);
  }

  return buildServiceDenial("SERVICE_NOT_FOUND", 404);
}

module.exports = {
  validateEventAccess,
  substituteEventCollaborator,
  listTodayExpectedCredentials,
  validateServiceAccess,
  substituteServiceAccess,
  listTodayExpectedServices,
  DENIAL_MESSAGES,
};
