"use strict";

const db = require("../../config/db");
const { child } = require("../../config/logger");
const teamsService = require("../teams/teams.service");
const alertsService = require("../alerts/alerts.service");
const { buildInfoCard } = require("../teams/adaptiveCards");

const log = child({ module: "gate.notifications" });

/**
 * Destinatários elegíveis: solicitante do acesso + aprovadores/gestores do setor.
 * Sem opt-in global — notificam sempre.
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

async function notifyServiceGateCheckIn({
  idServiceAccess,
  kind,
  subjectName,
  finalidade,
}) {
  try {
    const recipients = await listGateCheckInRecipients(idServiceAccess);
    if (!recipients.length) return;

    const who =
      kind === "vehicle"
        ? `Veículo ${subjectName || ""}`.trim()
        : `Colaborador ${subjectName || ""}`.trim();
    const mensagem = `${who} entrou na portaria — Acesso de serviço #${idServiceAccess}${
      finalidade ? ` (${finalidade})` : ""
    }.`;
    const path = `/admin/acessos-servico/${idServiceAccess}`;
    const detailUrl = teamsService.buildUserDeepLink(path);

    const card = buildInfoCard({
      titulo: "Entrada na portaria",
      mensagem,
      tipoLabel: "Acesso de serviço",
      idEntidade: idServiceAccess,
      finalidade: finalidade || null,
      detailUrl,
    });

    for (const user of recipients) {
      if (user.email) {
        try {
          await teamsService.notifyUser(user.email, mensagem, {
            path,
            adaptiveCard: card,
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
          tipo: "gate.service.check_in",
          titulo: "Entrada na portaria",
          mensagem,
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

async function notifyEventGateCheckIn({
  idEvent,
  credentialId,
  collaboratorName,
  eventName,
}) {
  try {
    const recipients = await listEventGateCheckInRecipients(idEvent);
    if (!recipients.length) return;

    const who = `Colaborador ${collaboratorName || ""}`.trim();
    const eventLabel = eventName ? ` — ${eventName}` : "";
    const mensagem = `${who} entrou na portaria${eventLabel} (credencial #${credentialId}).`;
    const path = `/admin/eventos/${idEvent}`;
    const detailUrl = teamsService.buildUserDeepLink(path);

    const card = buildInfoCard({
      titulo: "Entrada na portaria",
      mensagem,
      tipoLabel: "Evento",
      idEntidade: idEvent,
      finalidade: eventName || null,
      detailUrl,
    });

    for (const user of recipients) {
      if (user.email) {
        try {
          await teamsService.notifyUser(user.email, mensagem, {
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
          tipo: "gate.event.check_in",
          titulo: "Entrada na portaria",
          mensagem,
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
  notifyServiceGateCheckIn,
  notifyEventGateCheckIn,
};
