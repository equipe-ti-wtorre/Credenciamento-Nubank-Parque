"use strict";

const { ConnectorClient, MicrosoftAppCredentials } = require("botframework-connector");
const { CardFactory } = require("botbuilder");
const env = require("../../../config/env");
const { child } = require("../../../config/logger");
const { getBotCredentials } = require("./credentials");

const log = child({ module: "teams.bot.proactive" });

/**
 * Envia Adaptive Card proativa 1:1 via Bot Connector.
 * @param {string} microsoftUserId AAD object id (usuarios.microsoft_id)
 * @param {object} adaptiveCard JSON Adaptive Card
 * @param {{ tenantId?: string }} [options]
 */
async function sendProactiveAdaptiveCard(microsoftUserId, adaptiveCard, options = {}) {
  const creds = await getBotCredentials();
  if (!creds) {
    return {
      ok: false,
      message:
        "Bot Teams não configurado. Cadastre um tenant Azure com client secret (Configurações → Tenants Azure) ou defina TEAMS_BOT_*.",
    };
  }
  if (!microsoftUserId) {
    return { ok: false, message: "Usuário sem microsoft_id para envio proativo." };
  }

  const tenantId = options.tenantId || creds.tenantId;
  if (!tenantId) {
    return {
      ok: false,
      message:
        "Tenant ID ausente. Marque o tenant como principal em Configurações → Tenants Azure ou defina TEAMS_BOT_TENANT_ID.",
    };
  }

  const serviceUrl = (env.teamsBotServiceUrl || "https://smba.trafficmanager.net/amer/").replace(
    /\/?$/,
    "/",
  );

  try {
    MicrosoftAppCredentials.trustServiceUrl(serviceUrl);
    const credentials = new MicrosoftAppCredentials(creds.appId, creds.appPassword, tenantId);
    const client = new ConnectorClient(credentials, { baseUri: serviceUrl });

    const conversationParameters = {
      isGroup: false,
      bot: { id: creds.appId },
      members: [{ id: microsoftUserId }],
      tenantId,
      channelData: { tenant: { id: tenantId } },
    };

    const conversation = await client.conversations.createConversation(conversationParameters);
    const conversationId = conversation.id || conversation.Id;
    if (!conversationId) {
      return { ok: false, message: "Bot Connector não retornou conversation id." };
    }

    await client.conversations.sendToConversation(conversationId, {
      type: "message",
      from: { id: creds.appId },
      attachments: [CardFactory.adaptiveCard(adaptiveCard)],
    });

    return { ok: true, conversationId, message: "Adaptive Card enviada via Bot." };
  } catch (err) {
    log.warn({ err, microsoftUserId }, "Falha ao enviar Adaptive Card proativa");
    return {
      ok: false,
      message: err?.message || "Falha no Bot Connector ao enviar Adaptive Card.",
    };
  }
}

module.exports = {
  sendProactiveAdaptiveCard,
};
