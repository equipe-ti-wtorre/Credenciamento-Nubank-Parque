"use strict";

/**
 * Adaptive Cards para aprovações e alertas informativos no Teams.
 */

const ADAPTIVE_MD_ESCAPE_RE = /([\\*_`[\]])/g;

function escapeAdaptiveText(value) {
  if (value == null) return "";
  return String(value).replace(ADAPTIVE_MD_ESCAPE_RE, "\\$1");
}

/** Extrai YYYY-MM-DD e formata como DD/MM/AAAA (calendário; Date usa America/Sao_Paulo). */
function formatDateBr(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${d}/${m}/${y}`;
  }
  const s = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatPeriodoBr(start, end) {
  const startBr = formatDateBr(start);
  const endBr = formatDateBr(end);
  if (startBr && endBr) return `${startBr} a ${endBr}`;
  if (startBr) return startBr;
  if (endBr) return endBr;
  return null;
}

function formatColaboradoresToggleLabel(names, { max = 15 } = {}) {
  if (!Array.isArray(names) || names.length === 0) return "";
  const safe = names.map((n) => escapeAdaptiveText(n)).filter(Boolean);
  const shown = safe.slice(0, max);
  const extra = safe.length - shown.length;
  let label = shown.join(" · ");
  if (extra > 0) label += ` · +${extra}`;
  return label;
}

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
  if (payload.colaboradores) {
    facts.push({ title: "Colaboradores", value: String(payload.colaboradores) });
  }
  return facts;
}

function pendingDecisionFacts(payload = {}) {
  const facts = [];
  if (payload.solicitanteNome) {
    facts.push({ title: "Solicitante", value: escapeAdaptiveText(payload.solicitanteNome) });
  }
  if (payload.periodo) {
    facts.push({ title: "Período", value: escapeAdaptiveText(payload.periodo) });
  }
  if (payload.finalidade) {
    facts.push({ title: "Finalidade", value: escapeAdaptiveText(payload.finalidade) });
  }
  if (payload.colaboradoresCount != null && payload.colaboradoresCount !== "") {
    const count = Number(payload.colaboradoresCount);
    if (Number.isFinite(count) && count >= 0) {
      facts.push({ title: "Colaboradores", value: String(count) });
    }
  }
  return facts;
}

/**
 * Card interativo de aprovação (botões Aprovar/Bloquear + Ver detalhe).
 * @param {object} payload
 * @param {{ interactive?: boolean }} options interactive=true usa Action.Submit (bot);
 *   false usa apenas Action.OpenUrl (abre o app).
 */
function withQueryAction(url, action) {
  if (!url) return "";
  const sep = String(url).includes("?") ? "&" : "?";
  return `${url}${sep}action=${action}`;
}

function buildDecisionActions(payload, options = {}) {
  const interactive = options.interactive === true;
  const detailUrl = payload.detailUrl || "";
  const idAprovacao = Number(payload.idAprovacao);
  const actions = [];

  if (interactive) {
    actions.push(
      {
        type: "Action.Submit",
        title: "✅ Aprovar",
        style: "positive",
        data: {
          action: "approve",
          idAprovacao,
        },
      },
      {
        type: "Action.Submit",
        title: "⛔ Bloquear",
        style: "destructive",
        data: {
          action: "reject",
          idAprovacao,
        },
      },
    );
  } else if (detailUrl) {
    actions.push(
      {
        type: "Action.OpenUrl",
        title: "✅ Aprovar",
        style: "positive",
        url: withQueryAction(detailUrl, "approve"),
      },
      {
        type: "Action.OpenUrl",
        title: "⛔ Bloquear",
        style: "destructive",
        url: withQueryAction(detailUrl, "reject"),
      },
    );
  }
  if (detailUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "Ver detalhe",
      url: detailUrl,
    });
  }
  return actions;
}

/**
 * Adaptive Card de aprovação pendente (criada ou avanço de nível).
 */
function buildCardAprovacaoPendente(payload = {}, options = {}) {
  const tipo = escapeAdaptiveText(payload.tipoLabel || "Solicitação");
  const numero = escapeAdaptiveText(payload.idEntidade != null ? payload.idEntidade : "");
  const setor = escapeAdaptiveText(payload.setorNome || "—");
  const nivel = Number(payload.nivel) || 1;
  const tituloRaw = payload.titulo || "Nova aprovação pendente";
  const titulo = tituloRaw.startsWith("🔔") ? tituloRaw : `🔔 ${tituloRaw}`;
  const names = Array.isArray(payload.colaboradoresNomes) ? payload.colaboradoresNomes : [];
  const hasCollabCount =
    payload.colaboradoresCount != null && payload.colaboradoresCount !== "";
  const count = hasCollabCount ? Number(payload.colaboradoresCount) : names.length;
  const facts = pendingDecisionFacts({
    ...payload,
    colaboradoresCount: hasCollabCount && Number.isFinite(count) ? count : undefined,
  });
  const countForSummary = Number.isFinite(count) ? count : 0;
  const summary =
    payload.summary ||
    payload.mensagem ||
    `Aprovação pendente: ${tipo} #${numero} (${setor}) — ${countForSummary} colaborador${
      countForSummary === 1 ? "" : "es"
    }`;

  const body = [
    {
      type: "ColumnSet",
      columns: [
        {
          type: "Column",
          width: "stretch",
          items: [
            {
              type: "TextBlock",
              text: escapeAdaptiveText(titulo),
              weight: "Bolder",
              size: "Medium",
              color: "Accent",
              wrap: true,
            },
            {
              type: "TextBlock",
              text: `${tipo} **#${numero}** · Setor ${setor}`,
              isSubtle: true,
              wrap: true,
              spacing: "None",
            },
          ],
        },
        {
          type: "Column",
          width: "auto",
          verticalContentAlignment: "Center",
          items: [
            {
              type: "TextBlock",
              text: `NÍVEL ${nivel}`,
              weight: "Bolder",
              size: "Small",
              color: "Warning",
              horizontalAlignment: "Right",
            },
          ],
        },
      ],
    },
  ];

  if (facts.length) {
    body.push({ type: "FactSet", facts, spacing: "Medium" });
  }

  if (countForSummary > 0 && names.length > 0) {
    body.push({
      type: "ActionSet",
      spacing: "Small",
      actions: [
        {
          type: "Action.ToggleVisibility",
          title: `👥 Ver colaboradores (${countForSummary})`,
          targetElements: ["listaColaboradores"],
        },
      ],
    });
    body.push({
      type: "Container",
      id: "listaColaboradores",
      isVisible: false,
      style: "emphasis",
      spacing: "Small",
      items: [
        {
          type: "TextBlock",
          text: formatColaboradoresToggleLabel(names),
          wrap: true,
          size: "Small",
        },
      ],
    });
  }

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    summary,
    msteams: { width: "Full" },
    body,
    actions: buildDecisionActions(payload, options),
  };
}

/** Alias compatível — delega ao card reformulado. */
function buildApprovalDecisionCard(payload, options = {}) {
  return buildCardAprovacaoPendente(payload, options);
}

/** Converte Action.Submit → OpenUrl preservando body (fallback Graph). */
function toOpenUrlDecisionCard(adaptiveCard, detailUrl) {
  if (!adaptiveCard || !detailUrl) return adaptiveCard;
  const cloned = JSON.parse(JSON.stringify(adaptiveCard));
  cloned.actions = (cloned.actions || []).map((action) => {
    if (action.type !== "Action.Submit") return action;
    const submitAction = action.data?.action;
    if (submitAction === "approve" || submitAction === "reject") {
      return {
        type: "Action.OpenUrl",
        title: action.title,
        style: action.style,
        url: withQueryAction(detailUrl, submitAction),
      };
    }
    return action;
  });
  return cloned;
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
  escapeAdaptiveText,
  formatDateBr,
  formatPeriodoBr,
  formatColaboradoresToggleLabel,
  withQueryAction,
  buildCardAprovacaoPendente,
  buildApprovalDecisionCard,
  toOpenUrlDecisionCard,
  buildDecisionResultCard,
  buildInfoCard,
};
