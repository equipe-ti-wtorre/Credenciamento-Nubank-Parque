"use strict";

const {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  ConfigurationServiceClientCredentialFactory,
} = require("botbuilder");
const { child } = require("../../../config/logger");
const {
  getBotCredentials,
  isBotConfigured,
  clearBotCredentialsCache,
  listBotCredentials,
} = require("./credentials");

const log = child({ module: "teams.bot.adapter" });

/** @type {Map<string, CloudAdapter>} */
const adaptersByAppId = new Map();

function buildAdapter(creds) {
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

  const adapter = new CloudAdapter(botFrameworkAuthentication);
  adapter.onTurnError = async (context, error) => {
    log.error({ err: error, appId: creds.appId }, "Erro no Bot Teams");
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

/**
 * @param {{ appId?: string|null }} [options] App ID do JWT inbound (multi-tenant).
 */
async function getAdapter(options = {}) {
  const creds = await getBotCredentials({ appId: options.appId || undefined });
  if (!creds) return null;

  const key = creds.appId.toLowerCase();
  let adapter = adaptersByAppId.get(key);
  if (adapter) return adapter;

  adapter = buildAdapter(creds);
  adaptersByAppId.set(key, adapter);
  log.info(
    { appId: creds.appId, label: creds.label, source: creds.source },
    "CloudAdapter Bot criado",
  );
  return adapter;
}

/** Pré-aquece adapters para todos os tenants com secret (opcional). */
async function warmAdapters() {
  const all = await listBotCredentials({ force: true });
  for (const creds of all) {
    const key = creds.appId.toLowerCase();
    if (!adaptersByAppId.has(key)) {
      adaptersByAppId.set(key, buildAdapter(creds));
    }
  }
  return all.map((c) => ({ appId: c.appId, label: c.label }));
}

function resetAdapter() {
  adaptersByAppId.clear();
  clearBotCredentialsCache();
}

module.exports = {
  isBotConfigured,
  getAdapter,
  getBotCredentials,
  resetAdapter,
  warmAdapters,
};
