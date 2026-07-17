const db = require("../../config/db");
const env = require("../../config/env");
const { child } = require("../../config/logger");
const AppError = require("../../utils/AppError");
const { maskDocument, formatDocument } = require("../../utils/privacy");
const collaboratorService = require("../collaborators/collaborator.service");
const vehicleService = require("../patrimonial/vehicle.service");
const approvalsService = require("../approvals/approvals.service");
const {
  STATUS_APROVADO,
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_NEGADO,
} = require("../credentials/credentials.schema");
const { normalizePlate } = require("../../utils/plate");
const { validateAndNormalizeCollaboratorPayload } = require("../collaborators/collaborator.schema");
const {
  assertNoOverlappingServiceCollaborator,
} = require("../patrimonial/service-access.service");

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
      id: row.id_substitute,
      name: row.substitute_name,
      document: row.substitute_document,
      documentType: row.substitute_document_type_description,
      picture: row.substitute_picture || null,
    };
  }
  return {
    id: row.id_collaborator,
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
      id_collaborator: effective.id,
      name: effective.name,
      document: formatDocument(effective.document, effective.documentType),
      document_masked: maskDocument(effective.document, effective.documentType),
      document_type: effective.documentType || null,
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
         edcc.id_collaborator,
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
      id: row.id_substitute,
      name: row.substitute_name,
      document: row.substitute_document,
      documentType: row.substitute_document_type_description,
      picture: row.substitute_picture || null,
    };
  }
  return {
    id: row.id_collaborator,
    name: row.collaborator_name,
    document: row.collaborator_document,
    documentType: row.document_type_description,
    picture: row.collaborator_picture || null,
  };
}

/**
 * Persiste o histórico diário de portaria (gate_access_day_log). As colunas em
 * service_access_* guardam apenas o estado do dia corrente; o log preserva todos os dias.
 */
async function recordServiceDayLog(kind, idRef, idServiceAccess, accessId, action) {
  const column = action === "CHECK_IN" ? "check_in" : "check_out";
  const extraUpdate = action === "CHECK_IN" ? ", check_out = NULL" : "";
  await db.execute(
    `INSERT INTO gate_access_day_log (kind, id_ref, id_service_access, access_id, access_date, ${column})
     VALUES (?, ?, ?, ?, CURDATE(), NOW())
     ON DUPLICATE KEY UPDATE ${column} = NOW()${extraUpdate}`,
    [kind, idRef, idServiceAccess, accessId],
  );
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

const WEEKDAY_LETTERS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Domingo–sábado da semana que contém todayKey (YYYY-MM-DD). */
function buildWeekDates(todayKey) {
  const base = new Date(`${todayKey}T00:00:00`);
  const start = new Date(base);
  start.setDate(base.getDate() - base.getDay());
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(toDateKey(d));
  }
  return dates;
}

/**
 * Status de cada dia da semana corrente para a linha da portaria.
 * accessedDates: dias (YYYY-MM-DD) com check_in registrado no gate_access_day_log.
 * lastCheckIn: último check-in do estado atual (cobre registros anteriores ao log).
 */
function buildWeekDays(row, weekDates, todayKey, accessedDates, lastCheckIn) {
  const startKey = toDateKey(row.start_date);
  const endKey = toDateKey(row.end_date);
  const lastCheckInKey = toDateKey(lastCheckIn);
  return weekDates.map((date, idx) => {
    const isToday = date === todayKey;
    let status = "none";
    if (startKey && endKey && date >= startKey && date <= endKey) {
      const accessed = accessedDates.has(date) || (lastCheckInKey != null && date === lastCheckInKey);
      if (accessed) status = "accessed";
      else if (date < todayKey) status = "missed";
      else status = "waiting";
    }
    return { date, weekday: WEEKDAY_LETTERS[idx], status, is_today: isToday };
  });
}

function mapTodayServiceVehicleRow(row, todayKey, ctx) {
  const rejected = Number(row.id_access_status) === STATUS_NEGADO;
  const pending = Number(row.id_access_status) === STATUS_AGUARDANDO_APROVACAO;
  const effective = resolveEffectiveVehicle(row);
  const next = rejected
    ? "REJECTED"
    : pending
      ? "PENDING_APPROVAL"
      : resolveServiceVehicleNextAction(row, todayKey) || "COMPLETED";
  const checkInToday = isTimestampToday(row.check_in, todayKey) ? row.check_in : null;
  const checkOutToday = isTimestampToday(row.check_out, todayKey) ? row.check_out : null;
  const accessedDates = ctx.logDates.get(`vehicle:${row.id_service_access_vehicle}`) || new Set();
  return {
    kind: "vehicle",
    id: row.id_service_access_vehicle,
    access_id: row.access_id || `pending-sav-${row.id_service_access_vehicle}`,
    vehicle: {
      plate: effective.plate,
      description: row.vehicle_description,
    },
    company: { name: row.company_fancy_name },
    finalidade: row.finalidade,
    check_in: checkInToday,
    check_out: checkOutToday,
    next_action: next,
    start_date: toDateKey(row.start_date),
    end_date: toDateKey(row.end_date),
    week_days: buildWeekDays(row, ctx.weekDates, todayKey, accessedDates, row.check_in),
    approved_by:
      pending || rejected
        ? null
        : ctx.approvers.get(Number(row.id_service_access)) || null,
    rejected_by: rejected
      ? ctx.rejectors.get(Number(row.id_service_access)) || null
      : null,
    id_service_access: Number(row.id_service_access),
    id_aprovacao: pending
      ? ctx.pendingApprovals.get(Number(row.id_service_access))?.id_aprovacao || null
      : null,
    id_setor: pending
      ? ctx.pendingApprovals.get(Number(row.id_service_access))?.id_setor || null
      : null,
    setor_nome: pending
      ? ctx.pendingApprovals.get(Number(row.id_service_access))?.setor_nome || null
      : null,
  };
}

function mapTodayServiceCollaboratorRow(row, todayKey, ctx) {
  const rejected = Number(row.id_access_status) === STATUS_NEGADO;
  const pending = Number(row.id_access_status) === STATUS_AGUARDANDO_APROVACAO;
  const effective = resolveEffectiveServiceCollaborator(row);
  const next = rejected
    ? "REJECTED"
    : pending
      ? "PENDING_APPROVAL"
      : resolveServiceCollaboratorNextAction(row, todayKey) || "COMPLETED";
  const checkInToday = isTimestampToday(row.access_check_in, todayKey)
    ? row.access_check_in
    : null;
  const checkOutToday = isTimestampToday(row.access_check_out, todayKey)
    ? row.access_check_out
    : null;
  const accessedDates =
    ctx.logDates.get(`collaborator:${row.id_service_access_collaborator}`) || new Set();
  const pendingInfo = ctx.pendingApprovals.get(Number(row.id_service_access)) || null;
  return {
    kind: "collaborator",
    id: row.id_service_access_collaborator,
    access_id: row.access_id || `pending-sac-${row.id_service_access_collaborator}`,
    collaborator: {
      id_collaborator: effective.id,
      name: effective.name,
      document: formatDocument(effective.document, effective.documentType),
      document_masked: maskDocument(effective.document, effective.documentType),
      document_type: effective.documentType || null,
      role: row.role_description,
      picture: effective.picture || null,
    },
    company: { name: row.company_fancy_name },
    finalidade: row.finalidade,
    check_in: checkInToday,
    check_out: checkOutToday,
    next_action: next,
    start_date: toDateKey(row.start_date),
    end_date: toDateKey(row.end_date),
    week_days: buildWeekDays(row, ctx.weekDates, todayKey, accessedDates, row.access_check_in),
    approved_by:
      pending || rejected
        ? null
        : ctx.approvers.get(Number(row.id_service_access)) || null,
    rejected_by: rejected
      ? ctx.rejectors.get(Number(row.id_service_access)) || null
      : null,
    id_service_access: Number(row.id_service_access),
    id_aprovacao: pending ? pendingInfo?.id_aprovacao || null : null,
    id_setor: pending ? pendingInfo?.id_setor || null : null,
    setor_nome: pending ? pendingInfo?.setor_nome || null : null,
  };
}

const GATE_TODAY_SERVICE_VEHICLES_SELECT = `
  SELECT sav.id_service_access_vehicle,
         sav.access_id,
         sav.check_in,
         sav.check_out,
         sav.id_substitute_vehicle,
         sa.id_service_access,
         sa.id_access_status,
         sa.start_date,
         sa.end_date,
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
  WHERE sa.id_access_status IN (?, ?, ?)
    AND sa.status = 1
    AND CURDATE() BETWEEN sa.start_date AND sa.end_date
    AND (
      (sa.id_access_status = ? AND sav.access_id IS NOT NULL)
      OR sa.id_access_status IN (?, ?)
    )
  ORDER BY
    CASE
      WHEN sa.id_access_status = ? THEN 0
      WHEN sa.id_access_status = ? THEN 1
      ELSE 2
    END,
    COALESCE(sub.plate, v.plate) ASC
`;

const GATE_TODAY_SERVICE_COLLABORATORS_SELECT = `
  SELECT sac.id_service_access_collaborator,
         sac.access_id,
         sac.access_check_in,
         sac.access_check_out,
         sac.id_collaborator,
         sac.id_substitute,
         sa.id_service_access,
         sa.id_access_status,
         sa.start_date,
         sa.end_date,
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
  WHERE sa.id_access_status IN (?, ?, ?)
    AND sa.status = 1
    AND CURDATE() BETWEEN sa.start_date AND sa.end_date
    AND (
      (sa.id_access_status = ? AND sac.access_id IS NOT NULL)
      OR sa.id_access_status IN (?, ?)
    )
  ORDER BY
    CASE
      WHEN sa.id_access_status = ? THEN 0
      WHEN sa.id_access_status = ? THEN 1
      ELSE 2
    END,
    COALESCE(sub.name, c.name) ASC
`;

function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

/** Última decisão APROVADO por acesso de serviço: Map<id_service_access, approved_by>. */
async function loadServiceApprovers(serviceAccessIds) {
  const approvers = new Map();
  if (!serviceAccessIds.length) return approvers;
  const placeholders = serviceAccessIds.map(() => "?").join(",");
  const [rows] = await db.execute(
    `SELECT a.id_entidade,
            ad.id_usuario,
            ad.decidido_em,
            u.nome_completo AS usuario_nome,
            s.nome AS setor_nome
     FROM aprovacao_decisoes ad
     INNER JOIN aprovacoes a ON a.id = ad.id_aprovacao
     INNER JOIN usuarios u ON u.id = ad.id_usuario
     LEFT JOIN setores s ON s.id = a.id_setor
     WHERE a.tipo_entidade = 'ACESSO_SERVICO'
       AND ad.decisao = 'APROVADO'
       AND a.id_entidade IN (${placeholders})
     ORDER BY ad.decidido_em ASC, ad.id ASC`,
    serviceAccessIds,
  );
  for (const row of rows) {
    approvers.set(Number(row.id_entidade), {
      id: Number(row.id_usuario),
      name: row.usuario_nome,
      initials: initialsFromName(row.usuario_nome),
      sector: row.setor_nome || null,
      decided_at: row.decidido_em,
    });
  }
  return approvers;
}

/** Última decisão REPROVADO por acesso de serviço. */
async function loadServiceRejectors(serviceAccessIds) {
  const rejectors = new Map();
  if (!serviceAccessIds.length) return rejectors;
  const placeholders = serviceAccessIds.map(() => "?").join(",");
  const [rows] = await db.execute(
    `SELECT a.id_entidade,
            ad.id_usuario,
            ad.decidido_em,
            u.nome_completo AS usuario_nome,
            s.nome AS setor_nome
     FROM aprovacao_decisoes ad
     INNER JOIN aprovacoes a ON a.id = ad.id_aprovacao
     INNER JOIN usuarios u ON u.id = ad.id_usuario
     LEFT JOIN setores s ON s.id = a.id_setor
     WHERE a.tipo_entidade = 'ACESSO_SERVICO'
       AND ad.decisao = 'REPROVADO'
       AND a.id_entidade IN (${placeholders})
     ORDER BY ad.decidido_em ASC, ad.id ASC`,
    serviceAccessIds,
  );
  for (const row of rows) {
    rejectors.set(Number(row.id_entidade), {
      id: Number(row.id_usuario),
      name: row.usuario_nome,
      initials: initialsFromName(row.usuario_nome),
      sector: row.setor_nome || null,
      decided_at: row.decidido_em,
    });
  }
  return rejectors;
}

/** Aprovação PENDENTE por acesso de serviço: Map<id_service_access, {id_aprovacao,id_setor,setor_nome}>. */
async function loadPendingApprovals(serviceAccessIds) {
  const pending = new Map();
  if (!serviceAccessIds.length) return pending;
  const placeholders = serviceAccessIds.map(() => "?").join(",");
  const [rows] = await db.execute(
    `SELECT a.id AS id_aprovacao,
            a.id_entidade,
            a.id_setor,
            s.nome AS setor_nome
       FROM aprovacoes a
       INNER JOIN setores s ON s.id = a.id_setor
      WHERE a.tipo_entidade = 'ACESSO_SERVICO'
        AND a.status = 'PENDENTE'
        AND a.id_entidade IN (${placeholders})
      ORDER BY a.id DESC`,
    serviceAccessIds,
  );
  for (const row of rows) {
    const key = Number(row.id_entidade);
    if (pending.has(key)) continue;
    pending.set(key, {
      id_aprovacao: Number(row.id_aprovacao),
      id_setor: Number(row.id_setor),
      setor_nome: row.setor_nome || null,
    });
  }
  return pending;
}

/** Dias com check_in na semana: Map<"kind:id_ref", Set<YYYY-MM-DD>>. */
async function loadWeekDayLogs(weekDates, vehicleIds, collaboratorIds) {
  const logDates = new Map();
  const conditions = [];
  const params = [weekDates[0], weekDates[6]];
  if (vehicleIds.length) {
    conditions.push(`(kind = 'vehicle' AND id_ref IN (${vehicleIds.map(() => "?").join(",")}))`);
    params.push(...vehicleIds);
  }
  if (collaboratorIds.length) {
    conditions.push(
      `(kind = 'collaborator' AND id_ref IN (${collaboratorIds.map(() => "?").join(",")}))`,
    );
    params.push(...collaboratorIds);
  }
  if (!conditions.length) return logDates;
  const [rows] = await db.execute(
    `SELECT kind, id_ref, access_date
     FROM gate_access_day_log
     WHERE access_date BETWEEN ? AND ?
       AND check_in IS NOT NULL
       AND (${conditions.join(" OR ")})`,
    params,
  );
  for (const row of rows) {
    const key = `${row.kind}:${row.id_ref}`;
    if (!logDates.has(key)) logDates.set(key, new Set());
    logDates.get(key).add(toDateKey(row.access_date));
  }
  return logDates;
}

async function listTodayExpectedServices() {
  const statusParams = [
    STATUS_APROVADO,
    STATUS_AGUARDANDO_APROVACAO,
    STATUS_NEGADO,
    STATUS_APROVADO,
    STATUS_AGUARDANDO_APROVACAO,
    STATUS_NEGADO,
    STATUS_AGUARDANDO_APROVACAO,
    STATUS_NEGADO,
  ];
  const [todayKey, vehicleResult, collaboratorResult] = await Promise.all([
    getMysqlTodayKey(),
    db.execute(GATE_TODAY_SERVICE_VEHICLES_SELECT, statusParams),
    db.execute(GATE_TODAY_SERVICE_COLLABORATORS_SELECT, statusParams),
  ]);
  const vehicleRows = vehicleResult[0];
  const collaboratorRows = collaboratorResult[0];

  const weekDates = buildWeekDates(todayKey);
  const serviceAccessIds = [
    ...new Set(
      [...vehicleRows, ...collaboratorRows].map((r) => Number(r.id_service_access)),
    ),
  ];
  const [approvers, rejectors, pendingApprovals, logDates] = await Promise.all([
    loadServiceApprovers(serviceAccessIds),
    loadServiceRejectors(serviceAccessIds),
    loadPendingApprovals(serviceAccessIds),
    loadWeekDayLogs(
      weekDates,
      vehicleRows.map((r) => r.id_service_access_vehicle),
      collaboratorRows.map((r) => r.id_service_access_collaborator),
    ),
  ]);
  const ctx = { weekDates, approvers, rejectors, pendingApprovals, logDates };

  const vehicles = vehicleRows.map((row) => mapTodayServiceVehicleRow(row, todayKey, ctx));
  const collaborators = collaboratorRows.map((row) =>
    mapTodayServiceCollaboratorRow(row, todayKey, ctx),
  );
  return sortTodayServicesByAccessPriority([...vehicles, ...collaborators]);
}

/** Aguardando entrada → liberação pendente → dentro → concluídos → reprovado; data mais nova acima. */
function sortTodayServicesByAccessPriority(list) {
  const rank = {
    CHECK_IN: 0,
    PENDING_APPROVAL: 1,
    CHECK_OUT: 2,
    COMPLETED: 3,
    REJECTED: 4,
  };
  return list.sort((a, b) => {
    const ra = rank[a.next_action] ?? 9;
    const rb = rank[b.next_action] ?? 9;
    if (ra !== rb) return ra - rb;
    const ta = entrySortTimestamp(a);
    const tb = entrySortTimestamp(b);
    if (ta !== tb) return tb - ta;
    const na = String(
      a.collaborator?.name || a.vehicle?.plate || a.finalidade || "",
    ).toLocaleLowerCase("pt-BR");
    const nb = String(
      b.collaborator?.name || b.vehicle?.plate || b.finalidade || "",
    ).toLocaleLowerCase("pt-BR");
    return na.localeCompare(nb, "pt-BR");
  });
}

/** Preferência: horário de check-in; senão data da aprovação/reprovação. */
function entrySortTimestamp(row) {
  const raw =
    row.check_in ||
    row.approved_by?.decided_at ||
    row.rejected_by?.decided_at ||
    null;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
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
  await recordServiceDayLog(
    "vehicle",
    row.id_service_access_vehicle,
    row.id_service_access,
    accessId,
    action,
  );

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
  await recordServiceDayLog(
    "collaborator",
    row.id_service_access_collaborator,
    row.id_service_access,
    accessId,
    action,
  );

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

async function listManualReleaseMeta() {
  await approvalsService.ensureActiveFlowsForTipo("ACESSO_SERVICO");

  const [[sectors], [companies], documentTypes, roles] = await Promise.all([
    db.execute(
      `SELECT s.id, s.nome
         FROM setor_fluxos sf
         JOIN setores s ON s.id = sf.id_setor
        WHERE sf.tipo_entidade = 'ACESSO_SERVICO' AND sf.ativo = 1 AND s.ativo = 1
        ORDER BY s.nome`,
    ),
    db.execute(
      `SELECT id_company, fancy_name, company_name
         FROM company
        WHERE status = 1
        ORDER BY COALESCE(fancy_name, company_name) ASC`,
    ),
    collaboratorService.listDocumentTypes(),
    collaboratorService.listRoles(),
  ]);

  return {
    sectors: sectors.map((s) => ({ id: Number(s.id), nome: s.nome })),
    companies: companies.map((c) => ({
      id_company: Number(c.id_company),
      fancy_name: c.fancy_name || c.company_name,
      company_name: c.company_name,
    })),
    document_types: documentTypes,
    roles,
  };
}

async function searchManualReleaseCollaborator(req, { document, id_collaborator_document_type }) {
  return collaboratorService.searchByDocument(req, {
    document,
    id_collaborator_document_type,
  });
}

async function searchManualReleaseCollaborators(req, { q }) {
  return collaboratorService.searchCollaboratorsByTerm(req, { q });
}

async function resolveManualReleasePeople(data) {
  const people = [];
  const seen = new Set();

  for (const rawId of data.id_collaborators || []) {
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    const existing = await collaboratorService.findCollaboratorById(id);
    if (!existing) throw new AppError(`Colaborador #${id} não encontrado.`, 404);
    if (!existing.status) throw new AppError(`Colaborador ${existing.name} está inativo.`, 400);
    const isBlacklisted = await collaboratorService.checkBlacklist(id);
    if (isBlacklisted) {
      throw new AppError(
        `Colaborador ${existing.name} consta na lista de restrição. Sem possibilidade de liberar.`,
        422,
      );
    }
    const roleId = Number(existing.id_collaborator_role);
    if (!roleId) throw new AppError(`Colaborador ${existing.name} sem função cadastrada.`, 422);
    seen.add(id);
    people.push({
      id_collaborator: id,
      name: existing.name,
      document: existing.document,
      id_collaborator_role: roleId,
      role_description: existing.role_description || null,
      created: false,
    });
  }

  for (const draft of data.collaborators || []) {
    const validated = await validateAndNormalizeCollaboratorPayload(draft);
    if (validated.error) throw new AppError(validated.error, 422);
    const created = await collaboratorService.insertCollaboratorRecord(validated.value);
    const id = Number(created.id_collaborator);
    if (seen.has(id)) continue;
    const isBlacklisted = await collaboratorService.checkBlacklist(id);
    if (isBlacklisted) {
      throw new AppError(
        `Colaborador ${created.name} consta na lista de restrição. Sem possibilidade de liberar.`,
        422,
      );
    }
    seen.add(id);
    people.push({
      id_collaborator: id,
      name: created.name,
      document: created.document,
      id_collaborator_role: Number(created.id_collaborator_role),
      role_description: created.role?.description || created.role_description || null,
      created: true,
    });
  }

  if (!people.length) {
    throw new AppError("Selecione ao menos um colaborador.", 422);
  }
  return people;
}

async function createManualRelease(req, data) {
  const userId = req.user?.id || null;
  if (!userId) throw new AppError("Usuário não autenticado.", 401);

  const idCompany = Number(data.id_company);
  const idSetor = Number(data.id_setor);
  const finalidade = String(data.finalidade).trim();
  const observacao = String(data.observacao).trim();
  if (!observacao) throw new AppError("Informe a descrição do serviço.", 400);

  const [deptRows] = await db.execute(
    `SELECT departamento FROM usuarios WHERE id = ? LIMIT 1`,
    [userId],
  );
  const requestingDepartment =
    (deptRows[0]?.departamento && String(deptRows[0].departamento).trim()) || "Portaria";

  const [companyRows] = await db.execute(
    `SELECT id_company, fancy_name, status FROM company WHERE id_company = ? LIMIT 1`,
    [idCompany],
  );
  if (!companyRows.length) throw new AppError("Empresa não encontrada.", 404);
  if (!companyRows[0].status) throw new AppError("Empresa inativa.", 400);

  await approvalsService.ensureActiveFlowsForTipo("ACESSO_SERVICO");
  const [setorRows] = await db.execute(
    `SELECT s.id, s.nome
       FROM setores s
       INNER JOIN setor_fluxos sf
         ON sf.id_setor = s.id AND sf.tipo_entidade = 'ACESSO_SERVICO' AND sf.ativo = 1
      WHERE s.id = ? AND s.ativo = 1
      LIMIT 1`,
    [idSetor],
  );
  if (!setorRows.length) {
    throw new AppError("Setor aprovador inválido ou sem fluxo ativo para acesso de serviço.", 400);
  }

  const eligibleApprovers = await approvalsService.listEligibleApprovers(idSetor, 1, {
    excludeUserIds: [],
  });
  if (!eligibleApprovers.length) {
    throw new AppError(
      `O setor ${setorRows[0].nome} não possui aprovador ou gestor ativo. Inclua membros no setor ou escolha outro setor.`,
      422,
    );
  }

  const people = await resolveManualReleasePeople(data);

  const todayKey = await getMysqlTodayKey();
  if (!todayKey) throw new AppError("Não foi possível obter a data atual.", 500);

  for (const person of people) {
    await assertNoOverlappingServiceCollaborator(
      person.id_collaborator,
      todayKey,
      todayKey,
      null,
    );
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [saResult] = await conn.execute(
      `INSERT INTO service_access (
         id_company, id_access_status, service_type, description,
         id_usuario, start_date, end_date, finalidade, requesting_department, observacao,
         notificar_entrada, notificar_entrada_colaborador, notificar_entrada_veiculo, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, 1)`,
      [
        idCompany,
        STATUS_AGUARDANDO_APROVACAO,
        finalidade,
        observacao,
        userId,
        todayKey,
        todayKey,
        finalidade,
        requestingDepartment,
        observacao,
      ],
    );
    const serviceId = saResult.insertId;

    for (const person of people) {
      await conn.execute(
        `INSERT INTO service_access_collaborator (id_service_access, id_collaborator, id_collaborator_role)
         VALUES (?, ?, ?)`,
        [serviceId, person.id_collaborator, person.id_collaborator_role],
      );
    }

    const approval = await approvalsService.createApprovalFor(conn, {
      tipoEntidade: "ACESSO_SERVICO",
      idEntidade: serviceId,
      idSetor,
      idSolicitante: userId,
    });

    await conn.commit();

    const first = people[0];
    return {
      id_service_access: serviceId,
      id_aprovacao: approval.id,
      id_setor: idSetor,
      setor_nome: setorRows[0].nome,
      id_access_status: STATUS_AGUARDANDO_APROVACAO,
      start_date: todayKey,
      end_date: todayKey,
      finalidade,
      company: {
        id_company: idCompany,
        fancy_name: companyRows[0].fancy_name,
      },
      collaborator: {
        id_collaborator: first.id_collaborator,
        name: first.name,
        document: first.document,
        id_collaborator_role: first.id_collaborator_role,
        role_description: first.role_description,
      },
      collaborators: people.map((p) => ({
        id_collaborator: p.id_collaborator,
        name: p.name,
        document: p.document,
        id_collaborator_role: p.id_collaborator_role,
        role_description: p.role_description,
      })),
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function notifyPendingServiceApproval(req, idServiceAccess) {
  const id = Number(idServiceAccess);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError("Acesso de serviço inválido.", 400);
  }

  const [rows] = await db.execute(
    `SELECT sa.id_service_access, sa.id_access_status, sa.status,
            a.id AS id_aprovacao, a.id_setor, a.id_solicitante, a.status AS aprovacao_status,
            s.nome AS setor_nome
       FROM service_access sa
       LEFT JOIN aprovacoes a
         ON a.tipo_entidade = 'ACESSO_SERVICO'
        AND a.id_entidade = sa.id_service_access
        AND a.status = 'PENDENTE'
       LEFT JOIN setores s ON s.id = a.id_setor
      WHERE sa.id_service_access = ?
      ORDER BY a.id DESC
      LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new AppError("Acesso de serviço não encontrado.", 404);
  if (!row.status) throw new AppError("Acesso de serviço desabilitado.", 400);
  if (Number(row.id_access_status) !== STATUS_AGUARDANDO_APROVACAO) {
    throw new AppError("Este acesso não está aguardando liberação.", 400);
  }
  if (!row.id_aprovacao || !row.id_setor) {
    throw new AppError("Não há aprovação pendente vinculada a este acesso.", 404);
  }

  const eligible = await approvalsService.listEligibleApprovers(Number(row.id_setor), 1, {
    excludeUserIds: [],
  });
  if (!eligible.length) {
    throw new AppError(
      `O setor ${row.setor_nome || ""} não possui aprovador ou gestor ativo para notificar.`.trim(),
      422,
    );
  }

  const { notifyApprovalCreated } = require("../approvals/approvals.notifications");
  const result = await notifyApprovalCreated({
    idAprovacao: Number(row.id_aprovacao),
    idSetor: Number(row.id_setor),
    idSolicitante: row.id_solicitante || req.user?.id || null,
  });

  if (!result?.notified) {
    throw new AppError(
      result?.reason === "no_approvers"
        ? `O setor ${row.setor_nome || ""} não possui aprovador ativo.`
        : "Não foi possível notificar o setor. Tente novamente.",
      422,
    );
  }

  return {
    id_service_access: id,
    id_aprovacao: Number(row.id_aprovacao),
    id_setor: Number(row.id_setor),
    setor_nome: row.setor_nome,
    notified: result.notified,
  };
}

async function cancelPendingServiceApproval(req, idServiceAccess) {
  const id = Number(idServiceAccess);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError("Acesso de serviço inválido.", 400);
  }

  const [rows] = await db.execute(
    `SELECT sa.id_service_access, sa.id_access_status, sa.status,
            a.id AS id_aprovacao, a.id_setor, a.id_solicitante, a.status AS aprovacao_status,
            s.nome AS setor_nome
       FROM service_access sa
       LEFT JOIN aprovacoes a
         ON a.tipo_entidade = 'ACESSO_SERVICO'
        AND a.id_entidade = sa.id_service_access
        AND a.status = 'PENDENTE'
       LEFT JOIN setores s ON s.id = a.id_setor
      WHERE sa.id_service_access = ?
      ORDER BY a.id DESC
      LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new AppError("Acesso de serviço não encontrado.", 404);
  if (Number(row.id_access_status) !== STATUS_AGUARDANDO_APROVACAO) {
    throw new AppError("Este acesso não está aguardando liberação.", 400);
  }
  if (!row.id_aprovacao) {
    throw new AppError("Não há aprovação pendente vinculada a este acesso.", 404);
  }

  const userId = req.user?.id;
  if (!userId) throw new AppError("Usuário não autenticado.", 401);
  const isAdmin = !!req.user?.is_super_admin;
  const isSolicitante = Number(row.id_solicitante) === Number(userId);
  if (!isAdmin && !isSolicitante) {
    // Portaria: quem tem permissão de criar na gate pode cancelar liberação manual pendente.
    const { hasPermission } = require("../../utils/permissions");
    if (!hasPermission(req.user, "gate", "create") && !hasPermission(req.user, "gate", "edit")) {
      throw new AppError("Sem permissão para cancelar esta solicitação.", 403);
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE aprovacoes
          SET status = 'REPROVADO', finalizado_em = NOW()
        WHERE id = ? AND status = 'PENDENTE'`,
      [row.id_aprovacao],
    );
    await conn.execute(
      `INSERT INTO aprovacao_decisoes (id_aprovacao, nivel, id_usuario, decisao, comentario)
       SELECT a.id, a.nivel_atual, ?, 'REPROVADO', ?
         FROM aprovacoes a
        WHERE a.id = ?`,
      [userId, "Cancelado na portaria.", row.id_aprovacao],
    );
    await conn.execute(
      `UPDATE service_access SET id_access_status = ? WHERE id_service_access = ?`,
      [STATUS_NEGADO, id],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return {
    id_service_access: id,
    id_aprovacao: Number(row.id_aprovacao),
    id_setor: Number(row.id_setor),
    setor_nome: row.setor_nome,
  };
}

module.exports = {
  validateEventAccess,
  substituteEventCollaborator,
  listTodayExpectedCredentials,
  validateServiceAccess,
  substituteServiceAccess,
  listTodayExpectedServices,
  listManualReleaseMeta,
  searchManualReleaseCollaborator,
  searchManualReleaseCollaborators,
  createManualRelease,
  notifyPendingServiceApproval,
  cancelPendingServiceApproval,
  DENIAL_MESSAGES,
};
