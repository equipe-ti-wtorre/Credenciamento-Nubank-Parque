"use strict";

const db = require("../../config/db");
const env = require("../../config/env");
const { child } = require("../../config/logger");
const { STATUS_APROVADO } = require("../credentials/credentials.schema");
const { sendRevokeSafe } = require("./facial.command.service");

const logger = child({ module: "facial-expire" });

const FACIAL_ACTIVE_STATUSES = ["synced", "partial", "pending", "failed"];

function graceHours() {
  return Math.max(0, Number(env.facialRevokeGraceHours) || 0);
}

async function listExpiredAccessCollaboratorIds() {
  const grace = graceHours();
  const statuses = FACIAL_ACTIVE_STATUSES;
  const [rows] = await db.execute(
    `SELECT c.id_collaborator
     FROM collaborator c
     WHERE c.facial_status IN (?, ?, ?, ?)
       AND NOT EXISTS (
         SELECT 1
         FROM service_access_collaborator sac
         INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
         WHERE (sac.id_collaborator = c.id_collaborator OR sac.id_substitute = c.id_collaborator)
           AND sa.status = 1
           AND sa.id_access_status = ?
           AND NOW() <= DATE_ADD(CONCAT(sa.end_date, ' 23:59:59'), INTERVAL ? HOUR)
       )
       AND NOT EXISTS (
         SELECT 1
         FROM event_day_company_collaborator edcc
         INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
         INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
         INNER JOIN event e ON e.id_event = ed.id_event
         WHERE (edcc.id_collaborator = c.id_collaborator OR edcc.id_substitute = c.id_collaborator)
           AND edcc.id_access_status = ?
           AND e.ativo = 1
           AND NOW() <= DATE_ADD(CONCAT(ed.date, ' 23:59:59'), INTERVAL ? HOUR)
       )`,
    [...statuses, STATUS_APROVADO, grace, STATUS_APROVADO, grace],
  );
  return rows.map((row) => Number(row.id_collaborator)).filter(Boolean);
}

async function revokeFacialForExpiredAccesses() {
  const ids = await listExpiredAccessCollaboratorIds();
  const unique = [...new Set(ids)];
  if (!unique.length) {
    return { ok: true, candidateCount: 0, graceHours: graceHours() };
  }
  for (const id of unique) {
    await sendRevokeSafe(id, "period_expired");
  }
  logger.info(
    { candidateCount: unique.length, graceHours: graceHours() },
    "Revoke facial enviado para acessos além do prazo extra",
  );
  return { ok: true, candidateCount: unique.length, graceHours: graceHours() };
}

module.exports = {
  revokeFacialForExpiredAccesses,
  listExpiredAccessCollaboratorIds,
};
