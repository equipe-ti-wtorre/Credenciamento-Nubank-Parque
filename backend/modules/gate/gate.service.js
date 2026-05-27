const db = require("../../config/db");
const env = require("../../config/env");
const { child } = require("../../config/logger");
const AppError = require("../../utils/AppError");
const { maskDocument } = require("../../utils/privacy");
const collaboratorService = require("../collaborators/collaborator.service");
const { STATUS_APROVADO } = require("../credentials/credentials.schema");

const logger = child({ module: "gate" });

const GATE_CREDENTIAL_SELECT = `
  SELECT edcc.*,
         ast.description AS access_status_description,
         c.name AS collaborator_name,
         c.document AS collaborator_document,
         cdt.description AS document_type_description,
         cr.description AS role_description,
         sub.name AS substitute_name,
         sub.document AS substitute_document,
         sub_cdt.description AS substitute_document_type_description,
         co.fancy_name AS company_fancy_name,
         ed.date AS event_day_date,
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
    };
  }
  return {
    name: row.collaborator_name,
    document: row.collaborator_document,
    documentType: row.document_type_description,
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
      },
      company: {
        fancy_name: row.company_fancy_name,
      },
      action_registered: actionRegistered,
      access_id: row.access_id,
      id_event_day_company_collaborator: row.id_event_day_company_collaborator,
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
         cdt.description AS document_type_description,
         cr.description AS role_description,
         sub.name AS substitute_name,
         sub.document AS substitute_document,
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
    AND edcc.access_id IS NOT NULL
    AND ${EVENT_DAY_WINDOW_SQL.trim()}
  ORDER BY COALESCE(sub.name, c.name) ASC, e.name ASC
`;

async function listTodayExpectedCredentials() {
  const params = [STATUS_APROVADO, ...eventDayWindowParams()];
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

function validateServiceAccess() {
  throw new AppError("Módulo patrimonial ainda não disponível.", 501);
}

function substituteServiceAccess() {
  throw new AppError("Módulo patrimonial ainda não disponível.", 501);
}

module.exports = {
  validateEventAccess,
  substituteEventCollaborator,
  listTodayExpectedCredentials,
  validateServiceAccess,
  substituteServiceAccess,
  DENIAL_MESSAGES,
};
