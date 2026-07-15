"use strict";

const { ActivityHandler, CardFactory } = require("botbuilder");
const db = require("../../../config/db");
const { child } = require("../../../config/logger");
const approvalsService = require("../../approvals/approvals.service");
const {
  notifyApprovalAdvanced,
  notifyApprovalFinalized,
} = require("../../approvals/approvals.notifications");
const { buildDecisionResultCard } = require("../adaptiveCards");
const env = require("../../../config/env");
const { normalizeHttpsAppUrl, buildTeamsActivityWebUrl } = require("../../../utils/microsoftGraph");

const log = child({ module: "teams.bot" });

async function findUserByAadIdOrEmail(activity) {
  const aadId = activity.from?.aadObjectId || activity.from?.id;
  const email =
    activity.from?.email ||
    activity.from?.userPrincipalName ||
    null;

  if (aadId && !String(aadId).includes(":")) {
    const [rows] = await db.execute(
      `SELECT id, nome_completo, email, microsoft_id, ativo, id_perfil
         FROM usuarios WHERE microsoft_id = ? AND ativo = 1 LIMIT 1`,
      [aadId],
    );
    if (rows[0]) return rows[0];
  }

  if (email) {
    const [rows] = await db.execute(
      `SELECT id, nome_completo, email, microsoft_id, ativo, id_perfil
         FROM usuarios WHERE LOWER(email) = LOWER(?) AND ativo = 1 LIMIT 1`,
      [email],
    );
    if (rows[0]) return rows[0];
  }

  return null;
}

function buildDetailUrl(idAprovacao) {
  const base =
    normalizeHttpsAppUrl(env.teamsActivityWebUrl) ||
    normalizeHttpsAppUrl(env.msalRedirectUriWeb) ||
    null;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/aprovacoes/${idAprovacao}`;
}

function extractActionData(activity) {
  const raw = activity.value || {};
  const action = raw.action || raw.data?.action;
  const idAprovacao = Number(raw.idAprovacao || raw.data?.idAprovacao);
  return { action, idAprovacao };
}

async function loadApprovalFacts(idAprovacao) {
  const [rows] = await db.query(
    `SELECT a.*, s.nome AS setor_nome, u.nome_completo AS solicitante_nome
       FROM aprovacoes a
       JOIN setores s ON s.id = a.id_setor
       JOIN usuarios u ON u.id = a.id_solicitante
      WHERE a.id = ? LIMIT 1`,
    [idAprovacao],
  );
  const a = rows[0];
  if (!a) return {};
  const tipoLabel = a.tipo_entidade === "EVENTO" ? "Evento" : "Acesso de serviço";
  let periodo = null;
  let finalidade = null;
  if (a.tipo_entidade === "ACESSO_SERVICO") {
    const [sa] = await db.query(
      `SELECT start_date, end_date, finalidade FROM service_access WHERE id_service_access = ? LIMIT 1`,
      [a.id_entidade],
    );
    if (sa[0]) {
      periodo = `${String(sa[0].start_date).slice(0, 10)} → ${String(sa[0].end_date).slice(0, 10)}`;
      finalidade = sa[0].finalidade || null;
    }
  }
  return {
    tipoLabel,
    idEntidade: a.id_entidade,
    setorNome: a.setor_nome,
    solicitanteNome: a.solicitante_nome,
    periodo,
    finalidade,
  };
}

class CredenciamentoBot extends ActivityHandler {
  constructor() {
    super();

    this.onMessage(async (context, next) => {
      await context.sendActivity(
        "Use os botões da notificação de aprovação ou abra o app Credenciamento.",
      );
      await next();
    });
  }

  async handleTeamsCardActionSubmit(context) {
    return this.processDecision(context);
  }

  async processDecision(context) {
    const { action, idAprovacao } = extractActionData(context.activity);
    if (!action || !idAprovacao) {
      await context.sendActivity("Ação inválida. Abra o Credenciamento para decidir.");
      return;
    }

    const dbUser = await findUserByAadIdOrEmail(context.activity);
    if (!dbUser) {
      await context.sendActivity(
        "Seu usuário Microsoft não está vinculado ao Credenciamento. Faça login no app uma vez.",
      );
      return;
    }

    const user = {
      id: dbUser.id,
      email: dbUser.email,
      nome_completo: dbUser.nome_completo,
      is_super_admin: false,
    };

    const facts = await loadApprovalFacts(idAprovacao);
    const detailUrl = buildDetailUrl(idAprovacao);
    const openUrl = detailUrl
      ? buildTeamsActivityWebUrl(detailUrl, { manifestAppId: env.teamsAppExternalId })
      : null;

    try {
      if (action === "approve") {
        const result = await approvalsService.approve(idAprovacao, user, {
          comentario: "Aprovado via Teams",
        });
        const card = buildDecisionResultCard({
          ...facts,
          status: result.finalizada ? "APROVADO" : "PENDENTE",
          mensagem: result.finalizada
            ? "Solicitação aprovada com sucesso."
            : `Nível ${result.nivelDecidido} aprovado. Aguardando próximo nível.`,
          decididoPor: dbUser.nome_completo,
          detailUrl: openUrl || detailUrl,
        });
        await context.sendActivity({
          attachments: [CardFactory.adaptiveCard(card)],
        });
        setImmediate(() => {
          void notifyApprovalAdvanced(result, user.id).catch(() => {});
        });
        return;
      }

      if (action === "reject") {
        const result = await approvalsService.reject(
          idAprovacao,
          user,
          "Reprovado via Teams",
        );
        const card = buildDecisionResultCard({
          ...facts,
          status: "REPROVADO",
          mensagem: "Solicitação bloqueada/reprovada.",
          decididoPor: dbUser.nome_completo,
          detailUrl: openUrl || detailUrl,
        });
        await context.sendActivity({
          attachments: [CardFactory.adaptiveCard(card)],
        });
        setImmediate(() => {
          void notifyApprovalFinalized(idAprovacao, "REPROVADO", "Reprovado via Teams").catch(
            () => {},
          );
        });
        return;
      }

      await context.sendActivity("Ação não reconhecida.");
    } catch (err) {
      log.warn({ err, idAprovacao, action, userId: user.id }, "Falha ao decidir via Teams");
      const msg = err?.message || "Não foi possível concluir a decisão.";
      await context.sendActivity(`${msg} Você pode decidir pelo app Credenciamento.`);
    }
  }
}

const bot = new CredenciamentoBot();

async function processActivity(req, res) {
  const adapter = await require("./adapter").getAdapter();
  if (!adapter) {
    res.status(503).json({ error: "Bot Teams não configurado." });
    return;
  }

  await adapter.process(req, res, async (context) => {
    if (
      context.activity.type === "invoke" &&
      (context.activity.name === "adaptiveCard/action" ||
        context.activity.name === "composeExtension/submitAction")
    ) {
      await bot.processDecision(context);
      if (context.activity.name === "adaptiveCard/action") {
        await context.sendActivity({ type: "invokeResponse", value: { status: 200 } });
      }
      return;
    }

    if (context.activity.type === "message" && context.activity.value?.action) {
      await bot.processDecision(context);
      return;
    }

    await bot.run(context);
  });
}

module.exports = {
  CredenciamentoBot,
  processActivity,
  buildDetailUrl,
};
