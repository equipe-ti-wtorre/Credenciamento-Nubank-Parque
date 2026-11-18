"use strict";

const { processActivity, extractBotAppIdFromRequest } = require("./bot");
const { isBotConfigured, getBotCredentials, listBotCredentials } = require("./credentials");
const { child } = require("../../../config/logger");

const log = child({ module: "teams.bot.controller" });

exports.messages = async (req, res) => {
  const started = Date.now();
  const appIdHint = extractBotAppIdFromRequest(req);
  const activityType = req.body?.type || null;
  const activityName = req.body?.name || null;

  // O Bot Framework sempre manda o JWT; sem ele nem chega ao adapter (antes respondia 500).
  if (!/^Bearer\s+\S+/i.test(String(req.headers.authorization || ""))) {
    return res.status(401).json({ error: "Não autorizado pelo Bot Framework." });
  }

  if (!(await isBotConfigured({ appId: appIdHint || undefined }))) {
    log.warn(
      { appIdHint, activityType, activityName },
      "Bot Teams não configurado para o request",
    );
    return res.status(503).json({
      error:
        "Bot Teams não configurado. Cadastre um tenant Azure ativo com client secret (Configurações → Tenants Azure) ou defina TEAMS_BOT_APP_ID e TEAMS_BOT_APP_PASSWORD.",
    });
  }

  const creds = await getBotCredentials({ appId: appIdHint || undefined });

  try {
    await processActivity(req, res);
    log.info(
      {
        appId: creds?.appId || appIdHint,
        label: creds?.label,
        activityType,
        activityName,
        durationMs: Date.now() - started,
        statusCode: res.statusCode,
      },
      "Bot Teams POST /messages",
    );
  } catch (err) {
    const msg = String(err?.message || err || "");
    const authFail =
      /unauthorized|401|authentication|authorization|jwt|token/i.test(msg) ||
      err?.statusCode === 401 ||
      err?.status === 401;

    log.error(
      {
        err,
        appIdHint,
        appId: creds?.appId,
        activityType,
        activityName,
        durationMs: Date.now() - started,
        authFail,
      },
      "Falha no endpoint do Bot Teams",
    );

    if (!res.headersSent) {
      if (authFail) {
        res.status(401).json({ error: "Não autorizado pelo Bot Framework." });
      } else {
        res.status(500).json({ error: "Erro ao processar mensagem do Bot." });
      }
    }
  }
};

exports.status = async (req, res) => {
  const creds = await getBotCredentials();
  const all = await listBotCredentials();
  const publicMessagingEndpoint = "https://cred.nbpdev.com.br/api/v1/teams/bot/messages";
  res.json({
    configured: !!(creds?.appId && creds?.appPassword),
    messagingEndpoint: "/api/v1/teams/bot/messages",
    publicMessagingEndpoint,
    source: creds?.source || null,
    label: creds?.label || null,
    appId: creds?.appId || null,
    tenantId: creds?.tenantId || null,
    tenants: all.map((c) => ({
      appId: c.appId,
      label: c.label,
      source: c.source,
      tenantId: c.tenantId,
    })),
    // 502 em teams.microsoft.com/.../agents/{botId}/invoke = Azure Bot não alcança este endpoint
    azureChecklist: [
      `Messaging endpoint do Azure Bot (App ID ${creds?.appId || "…"}) = ${publicMessagingEndpoint}`,
      "Canal Microsoft Teams ativo no recurso Azure Bot",
      "Single Tenant com o Directory (tenant) ID correto",
      "Client secret do App Registration = secret em Tenants Azure",
      "App Credenciamento reinstalado no Teams após criar/alterar o Azure Bot",
    ],
    invoke502Hint:
      "Se o console do Teams mostra 502 em /agents/.../invoke e este servidor não registra POST /teams/bot/messages, o Azure Bot (messaging endpoint) está ausente ou apontando para outra URL — não é falha do Action.Submit no Node.",
  });
};
