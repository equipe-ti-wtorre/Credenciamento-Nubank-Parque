"use strict";

const {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  ConfigurationServiceClientCredentialFactory,
} = require("botbuilder");
const env = require("../../../config/env");
const { child } = require("../../../config/logger");
const { getBotCredentials, isBotConfigured, clearBotCredentialsCache } = require("./credentials");

const log = child({ module: "teams.bot.adapter" });

let adapter = null;
let adapterAppId = null;

async function getAdapter() {
  const creds = await getBotCredentials();
  if (!creds) return null;

  if (adapter && adapterAppId === creds.appId) return adapter;

  const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: creds.appId,
    MicrosoftAppPassword: creds.appPassword,
    MicrosoftAppType: creds.tenantId ? "SingleTenant" : "MultiTenant",
    MicrosoftAppTenantId: creds.tenantId || undefined,
  });

  const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication(
    {},
    credentialsFactory,
  );

  adapter = new CloudAdapter(botFrameworkAuthentication);
  adapterAppId = creds.appId;
  adapter.onTurnError = async (context, error) => {
    log.error({ err: error }, "Erro no Bot Teams");
    try {
      await context.sendActivity(
        "Ocorreu um erro ao processar a ação. Tente pelo app Credenciamento.",
      );
    } catch {
      /* ignore */
    }
  };

  return adapter;
}

function resetAdapter() {
  adapter = null;
  adapterAppId = null;
  clearBotCredentialsCache();
}

module.exports = {
  isBotConfigured,
  getAdapter,
  getBotCredentials,
  resetAdapter,
};
