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

async function findActiveServiceDates(idCollaborator) {
  const [rows] = await db.execute(
    `SELECT sa.start_date, sa.end_date
     FROM service_access_collaborator sac
     INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
     WHERE (sac.id_collaborator = ? OR sac.id_substitute = ?)
       AND sa.status = 1
       AND sa.id_access_status = ?
       AND CURDATE() BETWEEN sa.start_date AND sa.end_date
     ORDER BY sa.end_date DESC, sa.start_date ASC
     LIMIT 1`,
    [idCollaborator, idCollaborator, STATUS_APROVADO],
  );
  const row = rows[0];
  if (!row) return null;
  const start = toSqlDate(row.start_date);
  const end = toSqlDate(row.end_date);
  if (!start || !end) return null;
  return { validDateStart: start, validDateEnd: end };
}

async function findActiveEventDates(idCollaborator) {
  const [rows] = await db.execute(
    `SELECT ed.date AS event_day_date
     FROM event_day_company_collaborator edcc
     INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
     INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
     INNER JOIN event e ON e.id_event = ed.id_event
     WHERE (edcc.id_collaborator = ? OR edcc.id_substitute = ?)
       AND edcc.id_access_status = ?
       AND e.ativo = 1
       AND ed.date = CURDATE()
     ORDER BY ed.date ASC
     LIMIT 1`,
    [idCollaborator, idCollaborator, STATUS_APROVADO],
  );
  const day = toSqlDate(rows[0]?.event_day_date);
  if (!day) return null;
  return { validDateStart: day, validDateEnd: day };
}

/**
 * Período de validade do enroll: datas do caller, senão acesso ativo, senão hoje/hoje.
 * Retorna só YYYY-MM-DD; o contrato anexa 00:00:00 / 23:59:59 no comando.
 */
async function resolveCollaboratorValidDates(idCollaborator, options = {}) {
  const start = toSqlDate(options.validDateStart);
  const end = toSqlDate(options.validDateEnd);
  if (start && end) {
    return { validDateStart: start, validDateEnd: end };
  }

  const id = Number(idCollaborator);
  if (id) {
    const fromService = await findActiveServiceDates(id);
    if (fromService) return fromService;
    const fromEvent = await findActiveEventDates(id);
    if (fromEvent) return fromEvent;
  }

  const today = await mysqlTodayKey();
  return { validDateStart: today, validDateEnd: today };
}

module.exports = {
  resolveCollaboratorValidDates,
};
