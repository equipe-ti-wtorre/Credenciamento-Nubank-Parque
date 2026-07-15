"use strict";

/**
 * Adaptive Cards para aprovações e alertas informativos no Teams.
 */

function detailFacts(payload = {}) {
  const facts = [];
  if (payload.tipoLabel) facts.push({ title: "Tipo", value: String(payload.tipoLabel) });
  if (payload.idEntidade != null) facts.push({ title: "Nº", value: String(payload.idEntidade) });
  if (payload.setorNome) facts.push({ title: "Setor", value: String(payload.setorNome) });
  if (payload.solicitanteNome) {
    facts.push({ title: "Solicitante", value: String(payload.solicitanteNome) });
  }
  if (payload.periodo) facts.push({ title: "Período", value: String(payload.periodo) });
  if (payload.finalidade) facts.push({ title: "Finalidade", value: String(payload.finalidade) });
  return facts;
}

/**
 * Card interativo de aprovação (botões Aprovar/Bloquear + Ver detalhe).
 * @param {object} payload
 * @param {{ interactive?: boolean }} options interactive=true usa Action.Submit (bot);
 *   false usa apenas Action.OpenUrl (abre o app).
 */
function buildApprovalDecisionCard(payload, options = {}) {
  const interactive = options.interactive !== false;
  const detailUrl = payload.detailUrl || "";
  const idAprovacao = Number(payload.idAprovacao);
  const facts = detailFacts(payload);

  const actions = [];
  if (interactive) {
    actions.push(
      {
        type: "Action.Submit",
        title: "Aprovar",
        style: "positive",
        data: {
          action: "approve",
          idAprovacao,
        },
      },
      {
        type: "Action.Submit",
        title: "Bloquear",
        style: "destructive",
        data: {
          action: "reject",
          idAprovacao,
        },
      },
    );
  } else {
    if (detailUrl) {
      actions.push({
        type: "Action.OpenUrl",
        title: "Aprovar / Bloquear no app",
        url: detailUrl.includes("?")
          ? `${detailUrl}&action=decide`
          : `${detailUrl}?action=decide`,
      });
    }
  }
  if (detailUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "Ver detalhe",
      url: detailUrl,
    });
  }

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: payload.titulo || "Aprovação pendente",
        weight: "Bolder",
        size: "Medium",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: payload.mensagem || "Há uma solicitação aguardando sua decisão.",
        wrap: true,
        spacing: "Small",
      },
      ...(facts.length
        ? [{ type: "FactSet", facts, spacing: "Medium" }]
        : []),
    ],
    actions,
  };
}

/** Card após decisão (substitui o interativo). */
function buildDecisionResultCard(payload) {
  const status = payload.status === "REPROVADO" ? "Bloqueada" : "Aprovada";
  const facts = detailFacts(payload);
  if (payload.decididoPor) {
    facts.push({ title: "Por", value: String(payload.decididoPor) });
  }
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `Solicitação ${status}`,
        weight: "Bolder",
        size: "Medium",
        wrap: true,
        color: payload.status === "REPROVADO" ? "Attention" : "Good",
      },
      {
        type: "TextBlock",
        text: payload.mensagem || "",
        wrap: true,
        spacing: "Small",
      },
      ...(facts.length ? [{ type: "FactSet", facts, spacing: "Medium" }] : []),
    ],
    actions: payload.detailUrl
      ? [{ type: "Action.OpenUrl", title: "Abrir no Credenciamento", url: payload.detailUrl }]
      : [],
  };
}

/** Card informativo (aprovação final / portaria) — sem botões de decisão. */
function buildInfoCard(payload) {
  const facts = detailFacts(payload);
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: payload.titulo || "Notificação",
        weight: "Bolder",
        size: "Medium",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: payload.mensagem || "",
        wrap: true,
        spacing: "Small",
      },
      ...(facts.length ? [{ type: "FactSet", facts, spacing: "Medium" }] : []),
    ],
    actions: payload.detailUrl
      ? [{ type: "Action.OpenUrl", title: "Abrir no Credenciamento", url: payload.detailUrl }]
      : [],
  };
}

module.exports = {
  buildApprovalDecisionCard,
  buildDecisionResultCard,
  buildInfoCard,
};
