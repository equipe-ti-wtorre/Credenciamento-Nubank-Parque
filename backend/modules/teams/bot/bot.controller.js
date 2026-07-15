"use strict";

const { processActivity } = require("./bot");
const { isBotConfigured, getBotCredentials } = require("./credentials");
const { child } = require("../../../config/logger");

const log = child({ module: "teams.bot.controller" });

exports.messages = async (req, res) => {
  if (!(await isBotConfigured())) {
    return res.status(503).json({
      error:
        "Bot Teams não configurado. Cadastre um tenant Azure ativo com client secret (Configurações → Tenants Azure) ou defina TEAMS_BOT_APP_ID e TEAMS_BOT_APP_PASSWORD.",
    });
  }
  try {
    await processActivity(req, res);
  } catch (err) {
    log.error({ err }, "Falha no endpoint do Bot Teams");
    if (!res.headersSent) {
      res.status(500).json({ error: "Erro ao processar mensagem do Bot." });
    }
  }
};

exports.status = async (req, res) => {
  const creds = await getBotCredentials();
  res.json({
    configured: !!(creds?.appId && creds?.appPassword),
    messagingEndpoint: "/api/v1/teams/bot/messages",
    source: creds?.source || null,
    label: creds?.label || null,
    appId: creds?.appId || null,
    tenantId: creds?.tenantId || null,
  });
};
