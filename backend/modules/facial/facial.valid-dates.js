"use strict";

const db = require("../../config/db");
const { STATUS_APROVADO } = require("../credentials/credentials.schema");
const { toSqlDate } = require("./facial.contract");

function localTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function mysqlTodayKey() {
  const [rows] = await db.execute(`SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d`);
  return rows[0]?.d || localTodayKey();
}

async function hasPortariaReleaseToday(idCollaborator) {
  const id = Number(idCollaborator);
  if (!id) return false;

  const [serviceRows] = await db.execute(
    `SELECT 1
     FROM service_access_collaborator sac
     INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
     WHERE (sac.id_collaborator = ? OR sac.id_substitute = ?)
       AND sa.status = 1
       AND sa.id_access_status = ?
       AND DATE(sac.facial_released_at) = CURDATE()
     LIMIT 1`,
    [id, id, STATUS_APROVADO],
  );
  if (serviceRows.length) return true;

  const [eventRows] = await db.execute(
    `SELECT 1
     FROM event_day_company_collaborator edcc
     INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
     INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
     INNER JOIN event e ON e.id_event = ed.id_event
     WHERE (edcc.id_collaborator = ? OR edcc.id_substitute = ?)
       AND edcc.id_access_status = ?
       AND e.ativo = 1
       AND DATE(edcc.facial_released_at) = CURDATE()
     LIMIT 1`,
    [id, id, STATUS_APROVADO],
  );
  return eventRows.length > 0;
}

/**
 * Enroll só depois da liberação da portaria no dia.
 * Datas explícitas do caller só valem se já houver facial_released_at hoje.
 */
async function resolveCollaboratorValidDates(idCollaborator, options = {}) {
  const id = Number(idCollaborator);
  if (!id || !(await hasPortariaReleaseToday(id))) {
    return null;
  }
  const today = await mysqlTodayKey();
  return {
    validDateStart: toSqlDate(options.validDateStart) || today,
    validDateEnd: toSqlDate(options.validDateEnd) || today,
  };
}

module.exports = {
  resolveCollaboratorValidDates,
  hasPortariaReleaseToday,
};
