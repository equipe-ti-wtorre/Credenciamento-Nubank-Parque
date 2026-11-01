"use strict";

const { ActivityHandler, CardFactory, TurnContext } = require("botbuilder");
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
const { lookupPublicId } = require("../../../utils/publicIdLookup");

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

async function buildDetailUrl(idAprovacao) {
  const publicId = await lookupPublicId("aprovacoes", "id", idAprovacao);
  const base =
    normalizeHttpsAppUrl(env.teamsActivityWebUrl) ||
    normalizeHttpsAppUrl(env.msalRedirectUriWeb) ||
    null;
  if (!base || !publicId) return null;
  return `${base.replace(/\/$/, "")}/aprovacoes/abrir/${publicId}`;
}

function extractActionData(activity) {
  const raw = activity.value || {};
  const action = raw.action || raw.data?.action;
  const idAprovacao = Number(raw.idAprovacao || raw.data?.idAprovacao);
  return { action, idAprovacao };
}

function formatCollaboratorsLabel(names) {
  if (!Array.isArray(names) || names.length === 0) return null;
  const max = 8;
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  let label = shown.join(", ");
  if (extra > 0) label += ` e mais ${extra}`;
  return label;
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
  const tipoLabel =
    a.tipo_entidade === "EVENTO"
      ? "Evento"
      : a.tipo_entidade === "CREDENCIAMENTO_EVENTO"
        ? "Credenciamento"
        : a.tipo_entidade === "CREDENCIAMENTO_EVENTO_INTERNO"
          ? "Credenciamento (internos)"
          : "Acesso de serviço";
  let periodo = null;
  let finalidade = null;
  let colaboradores = null;
  if (a.tipo_entidade === "ACESSO_SERVICO") {
    const [sa] = await db.query(
      `SELECT start_date, end_date, finalidade FROM service_access WHERE id_service_access = ? LIMIT 1`,
      [a.id_entidade],
    );
    if (sa[0]) {
      periodo = `${String(sa[0].start_date).slice(0, 10)} → ${String(sa[0].end_date).slice(0, 10)}`;
      finalidade = sa[0].finalidade || null;
    }
    const [collabRows] = await db.query(
      `SELECT c.name AS nome
         FROM service_access_collaborator sac
         INNER JOIN collaborator c ON c.id_collaborator = sac.id_collaborator
        WHERE sac.id_service_access = ?
        ORDER BY c.name ASC`,
      [a.id_entidade],
    );
    const names = (collabRows || []).map((r) => r.nome).filter(Boolean);
    colaboradores = formatCollaboratorsLabel(names);
  } else if (a.tipo_entidade === "CREDENCIAMENTO_EVENTO") {
    const [ea] = await db.query(
      `SELECT ea.name, ea.start, ea.end, c.fancy_name, c.company_name
         FROM event_accreditation_company eac
         INNER JOIN event_accreditation ea
           ON ea.id_event_accreditation = eac.id_event_accreditation
         LEFT JOIN company c ON c.id_company = eac.id_company
        WHERE eac.id_event_accreditation_company = ?
        LIMIT 1`,
      [a.id_entidade],
    );
    if (ea[0]) {
      finalidade = [ea[0].name, ea[0].fancy_name || ea[0].company_name].filter(Boolean).join(" — ");
      periodo = `${String(ea[0].start).slice(0, 10)} → ${String(ea[0].end).slice(0, 10)}`;
    }
    const [collabRows] = await db.query(
      `SELECT c.name AS nome
         FROM event_accreditation_collaborator eacol
         INNER JOIN collaborator c ON c.id_collaborator = eacol.id_collaborator
        WHERE eacol.id_event_accreditation_company = ?
        ORDER BY c.name ASC`,
      [a.id_entidade],
    );
    colaboradores = formatCollaboratorsLabel(
      (collabRows || []).map((r) => r.nome).filter(Boolean),
    );
  } else if (a.tipo_entidade === "CREDENCIAMENTO_EVENTO_INTERNO") {
    const [ea] = await db.query(
      `SELECT name, start, end FROM event_accreditation WHERE id_event_accreditation = ? LIMIT 1`,
      [a.id_entidade],
    );
    if (ea[0]) {
      finalidade = `${ea[0].name} — Internos`;
      periodo = `${String(ea[0].start).slice(0, 10)} → ${String(ea[0].end).slice(0, 10)}`;
    }
    const [collabRows] = await db.query(
      `SELECT u.nome_completo AS nome
         FROM event_accreditation_internal eai
         INNER JOIN usuarios u ON u.id = eai.id_usuario
        WHERE eai.id_event_accreditation = ?
        ORDER BY u.nome_completo ASC`,
      [a.id_entidade],
    );
    colaboradores = formatCollaboratorsLabel(
      (collabRows || []).map((r) => r.nome).filter(Boolean),
    );
  }
  return {
    tipoLabel,
    idEntidade: a.id_entidade,
    setorNome: a.setor_nome,
    solicitanteNome: a.solicitante_nome,
    periodo,
    finalidade,
    colaboradores,
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
    const detailUrl = await buildDetailUrl(idAprovacao);
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

/**
 * Extrai App ID do JWT Bot Framework (Authorization: Bearer …).
 */
function extractBotAppIdFromRequest(req) {
  try {
    const auth = req.headers?.authorization || req.headers?.Authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return null;
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const json = Buffer.from(payloadPart, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    const aud = payload.aud;
    if (typeof aud === "string" && /^[0-9a-f-]{36}$/i.test(aud)) return aud.toLowerCase();
    if (Array.isArray(aud)) {
      const id = aud.find((a) => typeof a === "string" && /^[0-9a-f-]{36}$/i.test(a));
      if (id) return String(id).toLowerCase();
    }
    if (payload.appid && /^[0-9a-f-]{36}$/i.test(payload.appid)) {
      return String(payload.appid).toLowerCase();
    }
    if (payload.azp && /^[0-9a-f-]{36}$/i.test(payload.azp)) {
      return String(payload.azp).toLowerCase();
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function processActivity(req, res) {
  const appIdHint = extractBotAppIdFromRequest(req);
  const { getAdapter, getBotCredentials } = require("./adapter");
  const adapter = await getAdapter({ appId: appIdHint });
  if (!adapter) {
    res.status(503).json({ error: "Bot Teams não configurado." });
    return;
  }
  const creds = await getBotCredentials({ appId: appIdHint || undefined });
  const botAppId = creds?.appId || appIdHint;

  await adapter.process(req, res, async (context) => {
    if (
      context.activity.type === "invoke" &&
      (context.activity.name === "adaptiveCard/action" ||
        context.activity.name === "composeExtension/submitAction")
    ) {
      // Ack do invoke antes de processar — o CloudAdapter só fecha o HTTP ao fim do turn.
      if (context.activity.name === "adaptiveCard/action") {
        await context.sendActivity({ type: "invokeResponse", value: { status: 200 } });
        const reference = TurnContext.getConversationReference(context.activity);
        const value = context.activity.value;
        const from = context.activity.from;

        setImmediate(() => {
          if (!botAppId) {
            log.error("Sem App ID para continueConversation após adaptiveCard/action");
            return;
          }
          void adapter
            .continueConversationAsync(botAppId, reference, async (ctx) => {
              ctx.activity.value = value;
              if (from) ctx.activity.from = from;
              try {
                await bot.processDecision(ctx);
              } catch (err) {
                log.error({ err }, "processDecision falhou após invokeResponse");
                try {
                  await ctx.sendActivity(
                    "Não foi possível concluir a decisão. Tente pelo app Credenciamento.",
                  );
                } catch {
                  /* ignore */
                }
              }
            })
            .catch((err) => {
              log.error({ err }, "continueConversation após adaptiveCard/action falhou");
            });
        });
        return;
      }

      try {
        await bot.processDecision(context);
      } catch (err) {
        log.error({ err }, "processDecision falhou no invoke");
        try {
          await context.sendActivity(
            "Não foi possível concluir a decisão. Tente pelo app Credenciamento.",
          );
        } catch {
          /* ignore */
        }
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
  extractBotAppIdFromRequest,
};
