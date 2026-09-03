"use strict";

const db = require("../../config/db");
const { child } = require("../../config/logger");
const { buildLinkedId, parseCollaboratorId } = require("./facial.contract");

const logger = child({ module: "facial-events" });

function parseEventTime(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function recordAccessEvent(payload) {
  const gatewayEventId = Number(payload.eventId);
  const userId = String(payload.userId);
  const linkedId = buildLinkedId(userId);
  const eventTime = parseEventTime(payload.eventTime);
  const recNo = payload.recNo != null && payload.recNo !== "" ? Number(payload.recNo) : null;
  const recNoValue = Number.isFinite(recNo) ? recNo : null;
  const deviceId = String(payload.deviceId);

  const [existingByEvent] = await db.execute(
    "SELECT id FROM facial_access_log WHERE gateway_event_id = ? LIMIT 1",
    [gatewayEventId],
  );
  if (existingByEvent.length > 0) {
    return { duplicate: true, id: existingByEvent[0].id };
  }

  if (recNoValue != null) {
    const [existingByRec] = await db.execute(
      "SELECT id FROM facial_access_log WHERE device_id = ? AND rec_no = ? LIMIT 1",
      [deviceId, recNoValue],
    );
    if (existingByRec.length > 0) {
      return { duplicate: true, id: existingByRec[0].id };
    }
  }

  try {
    const [result] = await db.execute(
      `INSERT INTO facial_access_log
         (gateway_event_id, device_id, rec_no, user_id, linked_id, event_time, antipassback, blocked, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gatewayEventId,
        deviceId,
        recNoValue,
        userId,
        linkedId,
        eventTime,
        payload.antipassback ? 1 : 0,
        payload.blocked ? 1 : 0,
        JSON.stringify(payload),
      ],
    );

    const collaboratorId = parseCollaboratorId(linkedId, userId);
    logger.info(
      {
        gatewayEventId,
        deviceId,
        userId,
        collaboratorId,
        blocked: payload.blocked,
      },
      "Evento de acesso facial registrado",
    );

    return { duplicate: false, id: result.insertId, collaboratorId };
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      const [again] = await db.execute(
        "SELECT id FROM facial_access_log WHERE gateway_event_id = ? LIMIT 1",
        [gatewayEventId],
      );
      if (again.length > 0) return { duplicate: true, id: again[0].id };
    }
    throw err;
  }
}

module.exports = {
  recordAccessEvent,
};
