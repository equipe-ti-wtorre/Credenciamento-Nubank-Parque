"use strict";

const db = require("../../config/db");
const { child } = require("../../config/logger");
const teamsService = require("../teams/teams.service");
const alertsService = require("../alerts/alerts.service");
const { buildInfoCard } = require("../teams/adaptiveCards");

const log = child({ module: "gate.notifications" });

const DEBOUNCE_MS = 60_000;

/**
 * Batches pendentes (in-memory).
 * Chave: `service:{id}` | `event:{id}`
 * @type {Map<string, { timer: ReturnType<typeof setTimeout>, items: object[], meta: object }>}
 */
const pendingBatches = new Map();

/**
 * Destinatários elegíveis: solicitante do acesso + aprovadores/gestores do setor.
 * Opt-in por kind: notificar_entrada_colaborador / notificar_entrada_veiculo.
 */
async function listGateCheckInRecipients(idServiceAccess) {
  const [saRows] = await db.query(
    `SELECT sa.id_service_access, sa.id_usuario AS id_solicitante,
            a.id_setor
       FROM service_access sa
       LEFT JOIN aprovacoes a
         ON a.tipo_entidade = 'ACESSO_SERVICO'
        AND a.id_entidade = sa.id_service_access
        AND a.status = 'APROVADO'
      WHERE sa.id_service_access = ?
      ORDER BY a.finalizado_em DESC
      LIMIT 1`,
    [idServiceAccess],
  );
  const sa = saRows[0];
  if (!sa) return [];

  let idSetor = sa.id_setor;
  if (!idSetor) {
    const [pend] = await db.query(
      `SELECT id_setor FROM aprovacoes
        WHERE tipo_entidade = 'ACESSO_SERVICO' AND id_entidade = ?
        ORDER BY id DESC LIMIT 1`,
      [idServiceAccess],
    );
    idSetor = pend[0]?.id_setor || null;
  }

  const userIds = new Set();
  if (sa.id_solicitante) userIds.add(Number(sa.id_solicitante));

  if (idSetor) {
    const [members] = await db.query(
      `SELECT su.id_usuario
         FROM setor_usuarios su
        WHERE su.id_setor = ? AND su.ativo = 1
          AND su.papel IN ('APROVADOR', 'GESTOR')`,
      [idSetor],
    );
    for (const m of members) userIds.add(Number(m.id_usuario));
  }

  if (!userIds.size) return [];

  const ids = [...userIds];
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT id, nome_completo, email
       FROM usuarios
      WHERE id IN (${placeholders}) AND ativo = 1`,
    ids,
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome_completo,
    email: r.email,
  }));
}

/**
 * Destinatários de check-in de evento: solicitante + aprovadores/gestores do setor,
 * apenas quem marcou notificar_portaria = 1 para aquele evento.
 */
async function listEventGateCheckInRecipients(idEvent) {
  const [apRows] = await db.query(
    `SELECT id_solicitante, id_setor
       FROM aprovacoes
      WHERE tipo_entidade = 'EVENTO' AND id_entidade = ?
      ORDER BY
        CASE WHEN status = 'APROVADO' THEN 0 ELSE 1 END,
        COALESCE(finalizado_em, criado_em) DESC,
        id DESC
      LIMIT 1`,
    [idEvent],
  );
  const ap = apRows[0];
  if (!ap) return [];

  const userIds = new Set();
  if (ap.id_solicitante) userIds.add(Number(ap.id_solicitante));

  if (ap.id_setor) {
    const [members] = await db.query(
      `SELECT su.id_usuario
         FROM setor_usuarios su
        WHERE su.id_setor = ? AND su.ativo = 1
          AND su.papel IN ('APROVADOR', 'GESTOR')`,
      [ap.id_setor],
    );
    for (const m of members) userIds.add(Number(m.id_usuario));
  }

  if (!userIds.size) return [];

  const ids = [...userIds];
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT u.id, u.nome_completo, u.email
       FROM usuarios u
       INNER JOIN usuario_evento_preferencias uep
         ON uep.id_usuario = u.id
        AND uep.id_event = ?
        AND uep.notificar_portaria = 1
      WHERE u.id IN (${placeholders}) AND u.ativo = 1`,
    [idEvent, ...ids],
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome_completo,
    email: r.email,
  }));
}

async function isServiceKindNotificationEnabled(idServiceAccess, kind) {
  const isVehicle = kind === "vehicle";
  const [flagRows] = await db.query(
    `SELECT notificar_entrada,
            notificar_entrada_colaborador,
            notificar_entrada_veiculo
       FROM service_access
      WHERE id_service_access = ?
      LIMIT 1`,
    [idServiceAccess],
  );
  const flags = flagRows[0];
  if (!flags) return false;

  return isVehicle
    ? flags.notificar_entrada_veiculo == null
      ? Number(flags.notificar_entrada) !== 0
      : Number(flags.notificar_entrada_veiculo) !== 0
    : flags.notificar_entrada_colaborador == null
      ? Number(flags.notificar_entrada) !== 0
      : Number(flags.notificar_entrada_colaborador) !== 0;
}

/** Deduplica por kind+subjectName, preservando ordem de chegada. */
function dedupeItems(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function enqueueBatch(key, item, meta, flushFn) {
  let batch = pendingBatches.get(key);
  if (!batch) {
    batch = { timer: null, items: [], meta };
    pendingBatches.set(key, batch);
  } else {
    batch.meta = { ...batch.meta, ...meta };
  }
  batch.items.push(item);
  if (batch.timer) clearTimeout(batch.timer);
  batch.timer = setTimeout(() => {
    void flushFn(key).catch((err) => {
      log.warn({ err, key }, "Falha no flush do batch de check-in");
    });
  }, DEBOUNCE_MS);
}

/**
 * Agenda notificação de check-in de serviço (debounce deslizante 60s).
 * Valida flags de notificação no enqueue.
 */
async function scheduleServiceGateCheckIn({
  idServiceAccess,
  kind,
  subjectName,
  finalidade,
}) {
  try {
    if (!idServiceAccess) return;
    const enabled = await isServiceKindNotificationEnabled(idServiceAccess, kind);
    if (!enabled) return;

    const key = `service:${idServiceAccess}`;
    enqueueBatch(
      key,
      {
        kind,
        subjectName: (subjectName || "").trim(),
        at: Date.now(),
      },
      { idServiceAccess, finalidade: finalidade || null },
      flushServiceBatch,
    );
  } catch (err) {
    log.warn({ err, idServiceAccess }, "Falha ao agendar check-in de portaria");
  }
}

/**
 * Agenda notificação de check-in de evento (debounce deslizante 60s).
 */
async function scheduleEventGateCheckIn({
  idEvent,
  credentialId,
  collaboratorName,
  eventName,
}) {
  try {
    if (!idEvent) return;

    const key = `event:${idEvent}`;
    enqueueBatch(
      key,
      {
        credentialId,
        collaboratorName: (collaboratorName || "").trim(),
        at: Date.now(),
      },
      { idEvent, eventName: eventName || null },
      flushEventBatch,
    );
  } catch (err) {
    log.warn({ err, idEvent }, "Falha ao agendar check-in de portaria (evento)");
  }
}

async function flushServiceBatch(key) {
  const batch = pendingBatches.get(key);
  if (!batch) return;
  pendingBatches.delete(key);
  if (batch.timer) clearTimeout(batch.timer);

  const { idServiceAccess, finalidade } = batch.meta;
  const items = dedupeItems(batch.items, (it) => `${it.kind}:${it.subjectName}`);
  if (!items.length) return;

  await notifyServiceGateCheckIn({ idServiceAccess, finalidade, items });
}

async function flushEventBatch(key) {
  const batch = pendingBatches.get(key);
  if (!batch) return;
  pendingBatches.delete(key);
  if (batch.timer) clearTimeout(batch.timer);

  const { idEvent, eventName } = batch.meta;
  const items = dedupeItems(
    batch.items,
    (it) => `${it.credentialId}:${it.collaboratorName}`,
  );
  if (!items.length) return;

  await notifyEventGateCheckIn({ idEvent, eventName, items });
}

function buildServiceCheckInCopy(idServiceAccess, finalidade, items) {
  const finalidadeSuffix = finalidade ? ` (${finalidade})` : "";
  const ref = `Acesso de serviço #${idServiceAccess}${finalidadeSuffix}`;
  const activityRef = `Serviço #${idServiceAccess}${finalidadeSuffix}`;

  if (items.length === 1) {
    const item = items[0];
    const isVehicle = item.kind === "vehicle";
    const subject =
      item.subjectName || (isVehicle ? "Veículo" : "Colaborador");
    const titulo = isVehicle ? "Entrada de veículo" : "Entrada de colaborador";
    const alertTipo = isVehicle
      ? "gate.service.vehicle.check_in"
      : "gate.service.collaborator.check_in";
    const who = isVehicle ? `Veículo ${subject}` : `Colaborador ${subject}`;
    return {
      titulo,
      mensagem: `${who} entrou na portaria — ${ref}.`,
      activityMessage: `${subject} — ${activityRef}`,
      activityActor: titulo,
      alertTipo,
    };
  }

  const names = items.map((it) => {
    if (it.subjectName) return it.subjectName;
    return it.kind === "vehicle" ? "Veículo" : "Colaborador";
  });
  const n = items.length;
  return {
    titulo: "Entradas na portaria",
    mensagem: `${n} entradas na portaria — ${ref}: ${names.join(", ")}.`,
    activityMessage: `${n} acessos — ${activityRef}`,
    activityActor: "Entradas na portaria",
    alertTipo: "gate.service.check_in",
  };
}

function buildEventCheckInCopy(idEvent, eventName, items) {
  const eventLabel = eventName ? ` — ${eventName}` : "";

  if (items.length === 1) {
    const item = items[0];
    const who = `Colaborador ${item.collaboratorName || ""}`.trim();
    return {
      titulo: "Entrada na portaria",
      mensagem: `${who} entrou na portaria${eventLabel} (credencial #${item.credentialId}).`,
      alertTipo: "gate.event.check_in",
    };
  }

  const names = items.map((it) => it.collaboratorName || `credencial #${it.credentialId}`);
  const n = items.length;
  return {
    titulo: "Entradas na portaria",
    mensagem: `${n} entradas na portaria${eventLabel}: ${names.join(", ")}.`,
    alertTipo: "gate.event.check_in",
  };
}

/** Flush real: envia Teams + alerta in-app com itens acumulados. */
async function notifyServiceGateCheckIn({ idServiceAccess, finalidade, items }) {
  try {
    if (!items?.length) return;

    const recipients = await listGateCheckInRecipients(idServiceAccess);
    if (!recipients.length) return;

    const copy = buildServiceCheckInCopy(idServiceAccess, finalidade, items);
    const path = `/acessos-servico/${idServiceAccess}`;
    const detailUrl = teamsService.buildUserDeepLink(path);

    const card = buildInfoCard({
      titulo: copy.titulo,
      mensagem: copy.mensagem,
      tipoLabel: "Acesso de serviço",
      idEntidade: idServiceAccess,
      finalidade: finalidade || null,
      detailUrl,
    });

    for (const user of recipients) {
      if (user.email) {
        try {
          await teamsService.notifyUser(user.email, copy.mensagem, {
            path,
            adaptiveCard: card,
            activityActor: copy.activityActor,
            activityMessage: copy.activityMessage,
          });
        } catch (err) {
          log.warn({ err, email: user.email }, "Falha Teams ao notificar check-in");
        }
      }
    }

    try {
      await alertsService.createAlertsForUsers(
        recipients.map((r) => r.id),
        {
          tipo: copy.alertTipo,
          titulo: copy.titulo,
          mensagem: copy.mensagem,
          link: path,
          tipoReferencia: "service_access",
          idReferencia: idServiceAccess,
        },
      );
    } catch (err) {
      log.warn({ err, idServiceAccess }, "Falha alerta in-app no check-in");
    }
  } catch (err) {
    log.warn({ err, idServiceAccess }, "Falha ao notificar check-in de portaria");
  }
}

/** Flush real: envia Teams + alerta in-app com itens acumulados (evento). */
async function notifyEventGateCheckIn({ idEvent, eventName, items }) {
  try {
    if (!items?.length) return;

    const recipients = await listEventGateCheckInRecipients(idEvent);
    if (!recipients.length) return;

    const copy = buildEventCheckInCopy(idEvent, eventName, items);
    const path = `/admin/eventos/${idEvent}`;
    const detailUrl = teamsService.buildUserDeepLink(path);

    const card = buildInfoCard({
      titulo: copy.titulo,
      mensagem: copy.mensagem,
      tipoLabel: "Evento",
      idEntidade: idEvent,
      finalidade: eventName || null,
      detailUrl,
    });

    for (const user of recipients) {
      if (user.email) {
        try {
          await teamsService.notifyUser(user.email, copy.mensagem, {
            path,
            adaptiveCard: card,
          });
        } catch (err) {
          log.warn({ err, email: user.email }, "Falha Teams ao notificar check-in de evento");
        }
      }
    }

    try {
      await alertsService.createAlertsForUsers(
        recipients.map((r) => r.id),
        {
          tipo: copy.alertTipo,
          titulo: copy.titulo,
          mensagem: copy.mensagem,
          link: path,
          tipoReferencia: "event",
          idReferencia: idEvent,
        },
      );
    } catch (err) {
      log.warn({ err, idEvent }, "Falha alerta in-app no check-in de evento");
    }
  } catch (err) {
    log.warn({ err, idEvent }, "Falha ao notificar check-in de portaria (evento)");
  }
}

module.exports = {
  listGateCheckInRecipients,
  listEventGateCheckInRecipients,
  scheduleServiceGateCheckIn,
  scheduleEventGateCheckIn,
  /** Prefer schedule*; retained for tests/direct flush. */
  notifyServiceGateCheckIn,
  notifyEventGateCheckIn,
  DEBOUNCE_MS,
};
