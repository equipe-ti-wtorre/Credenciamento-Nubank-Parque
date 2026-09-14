"use strict";

const db = require("../../config/db");
const { child } = require("../../config/logger");
const { buildLinkedId, parseCollaboratorId } = require("./facial.contract");
const {
  resolveAccessDirection,
  directionToGateAction,
  shouldApplyFacialGate,
} = require("./facial.direction");
const gateService = require("../gate/gate.service");
const {
  scheduleServiceGateCheckIn,
  scheduleEventGateCheckIn,
} = require("../gate/gate.notifications");

const logger = child({ module: "facial-events" });

function parseEventTime(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function collaboratorExists(id) {
  if (!id) return false;
  const [rows] = await db.execute(
    "SELECT id_collaborator FROM collaborator WHERE id_collaborator = ? LIMIT 1",
    [id],
  );
  return rows.length > 0;
}

async function resolveCollaboratorIdFromEvent(linkedId, userId) {
  const parsed = parseCollaboratorId(linkedId, userId);
  if (parsed && (await collaboratorExists(parsed))) return parsed;

  const uid = userId != null ? String(userId).trim() : "";
  if (!uid) return parsed || null;

  const [byFacial] = await db.execute(
    `SELECT id_collaborator FROM collaborator
     WHERE facial_user_id = ? OR facial_linked_id = ?
     LIMIT 1`,
    [uid, linkedId || buildLinkedId(uid)],
  );
  if (byFacial[0]) return Number(byFacial[0].id_collaborator);

  if (!/^\d+$/.test(uid)) {
    const [byName] = await db.execute(
      "SELECT id_collaborator FROM collaborator WHERE name = ? LIMIT 1",
      [uid],
    );
    if (byName[0]) return Number(byName[0].id_collaborator);
  }

  return parsed || null;
}

function scheduleFacialGateNotification(data) {
  if (!data || data.action_registered !== "CHECK_IN") return;
  if (data.type === "EVENT" && data.id_event) {
    const idEvent = data.id_event;
    const collaboratorName = data.collaborator?.name;
    const eventName = data.event_name;
    const credentialId = data.id_event_day_company_collaborator;
    setImmediate(() => {
      void scheduleEventGateCheckIn({
        idEvent,
        credentialId,
        collaboratorName,
        eventName,
      }).catch(() => {});
    });
    return;
  }
  if (data.type === "SERVICE" && data.id_service_access) {
    const idServiceAccess = data.id_service_access;
    const subjectName = data.collaborator?.name;
    const finalidade = data.finalidade;
    setImmediate(() => {
      void scheduleServiceGateCheckIn({
        idServiceAccess,
        kind: data.kind || "collaborator",
        subjectName,
        finalidade,
      }).catch(() => {});
    });
  }
}

async function tryApplyGateFromFacial({ collaboratorId, direcao, blocked, duplicate }) {
  if (!shouldApplyFacialGate({ duplicate, blocked, collaboratorId, direcao })) {
    return { applied: false, skipped: true };
  }

  const action = directionToGateAction(direcao);
  try {
    const result = await gateService.applyCollaboratorGateAction(collaboratorId, action, {
      skipFacialEnroll: true,
    });
    if (result?.allowed && result.data?.action_registered === "CHECK_IN") {
      scheduleFacialGateNotification(result.data);
    }

    const applied = !!result?.allowed;
    logger.info(
      {
        collaboratorId,
        direcao,
        action,
        applied,
        error_code: result?.error_code || null,
        type: result?.data?.type || null,
      },
      applied ? "Portaria aplicada a partir do facial" : "Portaria não aplicada a partir do facial",
    );

    return {
      applied,
      skipped: false,
      action_registered: result?.data?.action_registered || null,
      error_code: result?.error_code || null,
      type: result?.data?.type || null,
    };
  } catch (err) {
    logger.warn({ err, collaboratorId, direcao }, "Falha ao aplicar portaria a partir do facial");
    return { applied: false, skipped: false, error_code: "GATE_APPLY_FAILED" };
  }
}

async function recordAccessEvent(payload) {
  const gatewayEventId = Number(payload.eventId);
  const userId = String(payload.userId);
  const linkedId = buildLinkedId(userId);
  const eventTime = parseEventTime(payload.eventTime);
  const recNo = payload.recNo != null && payload.recNo !== "" ? Number(payload.recNo) : null;
  const recNoValue = Number.isFinite(recNo) ? recNo : null;
  const deviceId = String(payload.deviceId);
  const direcao = resolveAccessDirection(payload);
  const collaboratorId = await resolveCollaboratorIdFromEvent(linkedId, userId);

  const [existingByEvent] = await db.execute(
    "SELECT id FROM facial_access_log WHERE gateway_event_id = ? LIMIT 1",
    [gatewayEventId],
  );
  if (existingByEvent.length > 0) {
    return {
      duplicate: true,
      id: existingByEvent[0].id,
      collaboratorId,
      direcao,
      gate: { applied: false, skipped: true },
    };
  }

  if (recNoValue != null) {
    const [existingByRec] = await db.execute(
      "SELECT id FROM facial_access_log WHERE device_id = ? AND rec_no = ? LIMIT 1",
      [deviceId, recNoValue],
    );
    if (existingByRec.length > 0) {
      return {
        duplicate: true,
        id: existingByRec[0].id,
        collaboratorId,
        direcao,
        gate: { applied: false, skipped: true },
      };
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

    logger.info(
      {
        gatewayEventId,
        deviceId,
        userId,
        collaboratorId,
        direcao,
        blocked: payload.blocked,
      },
      "Evento de acesso facial registrado",
    );

    const gate = await tryApplyGateFromFacial({
      collaboratorId,
      direcao,
      blocked: !!payload.blocked,
      duplicate: false,
    });

    return { duplicate: false, id: result.insertId, collaboratorId, direcao, gate };
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      const [again] = await db.execute(
        "SELECT id FROM facial_access_log WHERE gateway_event_id = ? LIMIT 1",
        [gatewayEventId],
      );
      if (again.length > 0) {
        return {
          duplicate: true,
          id: again[0].id,
          collaboratorId,
          direcao,
          gate: { applied: false, skipped: true },
        };
      }
    }
    throw err;
  }
}

module.exports = {
  recordAccessEvent,
  tryApplyGateFromFacial,
  shouldApplyFacialGate,
};
