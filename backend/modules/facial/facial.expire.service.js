"use strict";

const db = require("../../config/db");
const env = require("../../config/env");
const { child } = require("../../config/logger");
const { STATUS_APROVADO } = require("../credentials/credentials.schema");
const { scheduleRevokeUnlessReleasedToday } = require("./facial.command.service");

const logger = child({ module: "facial-expire" });

const FACIAL_ACTIVE_STATUSES = ["synced", "partial", "pending"];

async function listExpiredAccessCollaboratorIds() {
  const tolerance = Math.max(0, Number(env.gateAccessToleranceHours) || 0);

  const [serviceRows] = await db.execute(
    `SELECT DISTINCT COALESCE(sac.id_substitute, sac.id_collaborator) AS id_collaborator
     FROM service_access_collaborator sac
     INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
     INNER JOIN collaborator c
       ON c.id_collaborator = COALESCE(sac.id_substitute, sac.id_collaborator)
     WHERE sa.status = 1
       AND sa.end_date < CURDATE()
       AND c.facial_status IN (?, ?, ?)`,
    FACIAL_ACTIVE_STATUSES,
  );

  const [eventRows] = await db.execute(
    `SELECT DISTINCT COALESCE(edcc.id_substitute, edcc.id_collaborator) AS id_collaborator
     FROM event_day_company_collaborator edcc
     INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
     INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
     INNER JOIN event e ON e.id_event = ed.id_event
     INNER JOIN collaborator c
       ON c.id_collaborator = COALESCE(edcc.id_substitute, edcc.id_collaborator)
     WHERE edcc.id_access_status = ?
       AND e.ativo = 1
       AND NOW() > DATE_ADD(CONCAT(ed.date, ' 23:59:59'), INTERVAL ? HOUR)
       AND c.facial_status IN (?, ?, ?)`,
    [STATUS_APROVADO, tolerance, ...FACIAL_ACTIVE_STATUSES],
  );

  return [
    ...serviceRows.map((row) => Number(row.id_collaborator)),
    ...eventRows.map((row) => Number(row.id_collaborator)),
  ].filter(Boolean);
}

async function revokeFacialForExpiredAccesses() {
  const ids = await listExpiredAccessCollaboratorIds();
  const unique = [...new Set(ids)];
  if (!unique.length) {
    return { ok: true, candidateCount: 0 };
  }
  scheduleRevokeUnlessReleasedToday(unique, "period_expired");
  logger.info({ candidateCount: unique.length }, "Revoke facial agendado para acessos expirados");
  return { ok: true, candidateCount: unique.length };
}

module.exports = {
  revokeFacialForExpiredAccesses,
};
