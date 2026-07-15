"use strict";

const { child } = require("../../config/logger");
const db = require("../../config/db");
const teamsService = require("../teams/teams.service");
const approvalsService = require("./approvals.service");
const alertsService = require("../alerts/alerts.service");
const {
  buildApprovalDecisionCard,
  buildInfoCard,
} = require("../teams/adaptiveCards");
const { isBotConfigured } = require("../teams/bot/credentials");
const env = require("../../config/env");
const { normalizeHttpsAppUrl } = require("../../utils/microsoftGraph");

const log = child({ module: "approvals.notifications" });

async function loadApprovalContext(idAprovacao) {
  const [rows] = await db.query(
    `SELECT a.*, s.nome AS setor_nome, u.email AS solicitante_email, u.nome_completo AS solicitante_nome
       FROM aprovacoes a
       JOIN setores s ON s.id = a.id_setor
       JOIN usuarios u ON u.id = a.id_solicitante
      WHERE a.id = ? LIMIT 1`,
    [idAprovacao],
  );
  return rows[0] || null;
}

async function loadEntityExtras(aprovacao) {
  let periodo = null;
  let finalidade = null;
  if (aprovacao.tipo_entidade === "ACESSO_SERVICO") {
    const [rows] = await db.query(
      `SELECT start_date, end_date, finalidade FROM service_access WHERE id_service_access = ? LIMIT 1`,
      [aprovacao.id_entidade],
    );
    if (rows[0]) {
      periodo = `${String(rows[0].start_date).slice(0, 10)} → ${String(rows[0].end_date).slice(0, 10)}`;
      finalidade = rows[0].finalidade || null;
    }
  } else if (aprovacao.tipo_entidade === "EVENTO") {
    const [rows] = await db.query(
      `SELECT name FROM event WHERE id_event = ? LIMIT 1`,
      [aprovacao.id_entidade],
    );
    if (rows[0]?.name) finalidade = rows[0].name;
  }
  return { periodo, finalidade };
}

function buildMessage(aprovacao, extra = "") {
  const tipo = aprovacao.tipo_entidade === "EVENTO" ? "Evento" : "Acesso de serviço";
  return `${tipo} #${aprovacao.id_entidade} — setor ${aprovacao.setor_nome}. ${extra}`.trim();
}

function approvalPath(idAprovacao) {
  return `/aprovacoes/${idAprovacao}`;
}

function appDetailUrl(idAprovacao) {
  const base =
    normalizeHttpsAppUrl(env.teamsActivityWebUrl) ||
    normalizeHttpsAppUrl(env.msalRedirectUriWeb);
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${approvalPath(idAprovacao)}`;
}

function cardPayloadBase(aprovacao, extras = {}) {
  const tipoLabel = aprovacao.tipo_entidade === "EVENTO" ? "Evento" : "Acesso de serviço";
  const detailUrl =
    teamsService.buildUserDeepLink(approvalPath(aprovacao.id)) || appDetailUrl(aprovacao.id);
  return {
    idAprovacao: aprovacao.id,
    tipoLabel,
    idEntidade: aprovacao.id_entidade,
    setorNome: aprovacao.setor_nome,
    solicitanteNome: aprovacao.solicitante_nome,
    periodo: extras.periodo || null,
    finalidade: extras.finalidade || null,
    detailUrl,
  };
}

async function notifyUsers(approvers, { mensagem, tipo, titulo, idReferencia, adaptiveCard }) {
  const path = approvalPath(idReferencia);
  let sent = 0;
  for (const approver of approvers) {
    if (approver.email) {
      try {
        const result = await teamsService.notifyUser(approver.email, mensagem, {
          path,
          adaptiveCard,
        });
        if (result?.ok) {
          sent += 1;
        } else {
          log.warn(
            { email: approver.email, message: result?.message },
            "Teams não entregou notificação ao aprovador",
          );
        }
      } catch (err) {
        log.warn({ err, email: approver.email }, "Falha ao notificar aprovador via Teams");
      }
    }
  }
  if (!sent) {
    log.warn(
      {
        idReferencia,
        emails: approvers.map((a) => a.email),
      },
      "Nenhuma notificação Teams de aprovação foi entregue",
    );
  }

  try {
    await alertsService.createAlertsForUsers(
      approvers.map((a) => a.id),
      {
        tipo,
        titulo,
        mensagem,
        link: path,
        tipoReferencia: "aprovacao",
        idReferencia,
      },
    );
  } catch (err) {
    log.warn({ err, idReferencia, tipo }, "Falha ao criar alertas in-app para aprovadores");
  }
}

async function notifyApprovalCreated({ idAprovacao, idSetor, idSolicitante }) {
  try {
    // Inclui aprovadores/gestores mesmo se também forem o solicitante (cenário comum em setores pequenos).
    // Quem é só SOLICITANTE não entra — listEligibleApprovers filtra por papel.
    let approvers = await approvalsService.listEligibleApprovers(idSetor, 1, {
      excludeUserIds: [],
    });
    if (!approvers.length) {
      log.warn(
        { idAprovacao, idSetor, idSolicitante },
        "Nenhum APROVADOR/GESTOR ativo no setor para notificar na criação",
      );
      return;
    }
    const ctx = await loadApprovalContext(idAprovacao);
    if (!ctx) return;
    const extras = await loadEntityExtras(ctx);
    const mensagem = buildMessage(ctx, "Nova solicitação aguardando sua aprovação (nível 1).");
    const card = buildApprovalDecisionCard(
      {
        ...cardPayloadBase(ctx, extras),
        titulo: "Nova aprovação pendente",
        mensagem,
      },
      { interactive: await isBotConfigured() },
    );
    await notifyUsers(approvers, {
      mensagem,
      tipo: "approvals.created",
      titulo: "Nova aprovação pendente",
      idReferencia: idAprovacao,
      adaptiveCard: card,
    });
  } catch (err) {
    log.warn({ err, idAprovacao }, "Falha ao notificar criação de aprovação");
  }
}

async function notifyApprovalAdvanced(result, decidedByUserId) {
  try {
    if (result.finalizada) {
      await notifyApprovalFinalized(result.id, "APROVADO", null);
      return;
    }
    const ctx = await loadApprovalContext(result.id);
    if (!ctx) return;
    const extras = await loadEntityExtras(ctx);
    const approvers = await approvalsService.listEligibleApprovers(ctx.id_setor, result.nivelAtual, {
      excludeUserIds: [ctx.id_solicitante, decidedByUserId],
    });
    const mensagem = buildMessage(
      ctx,
      `Solicitação avançou para o nível ${result.nivelAtual}. Aguardando sua decisão.`,
    );
    const card = buildApprovalDecisionCard(
      {
        ...cardPayloadBase(ctx, extras),
        titulo: "Aprovação avançou de nível",
        mensagem,
      },
      { interactive: await isBotConfigured() },
    );
    await notifyUsers(approvers, {
      mensagem,
      tipo: "approvals.advanced",
      titulo: "Aprovação avançou de nível",
      idReferencia: result.id,
      adaptiveCard: card,
    });
  } catch (err) {
    log.warn({ err, idAprovacao: result.id }, "Falha ao notificar avanço de aprovação");
  }
}

async function notifyApprovalFinalized(idAprovacao, status, comentario) {
  try {
    const ctx = await loadApprovalContext(idAprovacao);
    if (!ctx) return;
    const extras = await loadEntityExtras(ctx);
    const label = status === "APROVADO" ? "aprovada" : "reprovada";
    let mensagem = buildMessage(ctx, `Sua solicitação foi ${label}.`);
    if (comentario) {
      mensagem += ` Comentário: ${comentario}`;
    }

    const path = approvalPath(idAprovacao);
    const card = buildInfoCard({
      ...cardPayloadBase(ctx, extras),
      titulo: status === "APROVADO" ? "Solicitação aprovada" : "Solicitação reprovada",
      mensagem,
    });

    if (ctx.solicitante_email) {
      try {
        await teamsService.notifyUser(ctx.solicitante_email, mensagem, {
          path,
          adaptiveCard: card,
        });
      } catch (err) {
        log.warn({ err, email: ctx.solicitante_email }, "Falha ao notificar solicitante via Teams");
      }
    }

    if (ctx.id_solicitante) {
      try {
        await alertsService.createAlert({
          idUsuario: ctx.id_solicitante,
          tipo: "approvals.finalized",
          titulo: status === "APROVADO" ? "Solicitação aprovada" : "Solicitação reprovada",
          mensagem,
          link: path,
          tipoReferencia: "aprovacao",
          idReferencia: idAprovacao,
        });
      } catch (err) {
        log.warn({ err, idAprovacao }, "Falha ao criar alerta in-app para solicitante");
      }
    }
  } catch (err) {
    log.warn({ err, idAprovacao }, "Falha ao notificar solicitante");
  }
}

module.exports = {
  notifyApprovalCreated,
  notifyApprovalAdvanced,
  notifyApprovalFinalized,
  approvalPath,
};
