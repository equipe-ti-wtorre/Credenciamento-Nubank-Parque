"use strict";

/**
 * Credenciais do Bot Teams.
 * Prioridade:
 * 1. TEAMS_BOT_APP_ID + TEAMS_BOT_APP_PASSWORD (+ TEAMS_BOT_TENANT_ID opcional) no .env
 * 2. Tenant principal (ou primeiro ativo) em Configurações → Tenants Azure
 * 3. Por App ID (JWT inbound) ou azureTenantRefId (envio proativo)
 */

const db = require("../../../config/db");
const { decrypt } = require("../../../config/cryptoSecrets");
const env = require("../../../config/env");
const { child } = require("../../../config/logger");

const log = child({ module: "teams.bot.credentials" });

let cache = null;
let cacheAt = 0;
let allCache = null;
let allCacheAt = 0;
const CACHE_MS = 60_000;

function credentialsFromEnv() {
  const appId = env.teamsBotAppId;
  const appPassword = env.teamsBotAppPassword;
  if (!appId || !appPassword) return null;
  return {
    appId,
    appPassword,
    tenantId: env.teamsBotAppTenantId || null,
    source: "env",
    label: "TEAMS_BOT_* (.env)",
  };
}

function mapTenantRow(row) {
  if (!row) return null;
  let appPassword;
  try {
    appPassword = decrypt(row.client_secret_ciphertext);
  } catch (err) {
    log.warn({ err, tenantId: row.id }, "Falha ao descriptografar secret do tenant Azure");
    return null;
  }
  if (!appPassword || !row.client_id) return null;

  return {
    appId: String(row.client_id).trim(),
    appPassword,
    tenantId: String(row.azure_tenant_id).trim(),
    source: "azure_tenant",
    label: row.nome || `tenant #${row.id}`,
    azureTenantRefId: row.id,
  };
}

async function credentialsFromAzureTenant() {
  const [rows] = await db.execute(
    `SELECT id, nome, azure_tenant_id, client_id, client_secret_ciphertext
       FROM azure_tenants
      WHERE ativo = 1 AND client_secret_ciphertext IS NOT NULL
      ORDER BY eh_principal DESC, id ASC
      LIMIT 1`,
  );
  return mapTenantRow(rows[0]);
}

/** Credenciais de um tenant específico (para fan-out multi-tenant no Bot). */
async function credentialsFromAzureTenantById(azureTenantRefId) {
  const id = Number(azureTenantRefId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [rows] = await db.execute(
    `SELECT id, nome, azure_tenant_id, client_id, client_secret_ciphertext
       FROM azure_tenants
      WHERE id = ? AND ativo = 1 AND client_secret_ciphertext IS NOT NULL
      LIMIT 1`,
    [id],
  );
  return mapTenantRow(rows[0]);
}

/** Todos os tenants ativos com secret (+ override .env se existir). */
async function listBotCredentials({ force = false } = {}) {
  const now = Date.now();
  if (!force && allCache && now - allCacheAt < CACHE_MS) {
    return allCache;
  }

  const list = [];
  const fromEnv = credentialsFromEnv();
  if (fromEnv) list.push(fromEnv);

  try {
    const [rows] = await db.execute(
      `SELECT id, nome, azure_tenant_id, client_id, client_secret_ciphertext
         FROM azure_tenants
        WHERE ativo = 1 AND client_secret_ciphertext IS NOT NULL
        ORDER BY eh_principal DESC, id ASC`,
    );
    const seen = new Set(list.map((c) => c.appId.toLowerCase()));
    for (const row of rows) {
      const creds = mapTenantRow(row);
      if (!creds) continue;
      const key = creds.appId.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(creds);
    }
  } catch (err) {
    log.warn({ err }, "Falha ao listar credenciais Bot dos tenants Azure");
  }

  allCache = list;
  allCacheAt = now;
  return list;
}

async function credentialsFromAppId(appId) {
  if (!appId) return null;
  const needle = String(appId).trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(needle)) return null;
  const all = await listBotCredentials();
  return all.find((c) => c.appId.toLowerCase() === needle) || null;
}

/**
 * @param {{ force?: boolean, azureTenantRefId?: number, appId?: string }} [options]
 */
async function getBotCredentials({ force = false, azureTenantRefId, appId } = {}) {
  if (appId) {
    try {
      const byApp = await credentialsFromAppId(appId);
      if (byApp) return byApp;
    } catch (err) {
      log.warn({ err, appId }, "Falha ao resolver credenciais Bot por App ID");
    }
  }

  // Por integração: não usa cache global do principal (cada tenant tem App ID próprio).
  if (azureTenantRefId != null) {
    try {
      const byId = await credentialsFromAzureTenantById(azureTenantRefId);
      if (byId) return byId;
    } catch (err) {
      log.warn({ err, azureTenantRefId }, "Falha ao carregar credenciais do tenant da integração");
    }
    // Sem secret nesse tenant: cai no default abaixo.
  }

  const now = Date.now();
  if (!force && cache && now - cacheAt < CACHE_MS) {
    return cache;
  }

  const fromEnv = credentialsFromEnv();
  if (fromEnv) {
    cache = fromEnv;
    cacheAt = now;
    return cache;
  }

  try {
    cache = await credentialsFromAzureTenant();
  } catch (err) {
    log.warn({ err }, "Falha ao carregar credenciais do tenant Azure para o Bot");
    cache = null;
  }
  cacheAt = now;
  return cache;
}

async function isBotConfigured(options = {}) {
  const creds = await getBotCredentials(options);
  return !!(creds?.appId && creds?.appPassword);
}

/** Action.Submit no card — só com TEAMS_BOT_INTERACTIVE=true (messaging endpoint Azure OK). */
async function isBotInteractiveEnabled(options = {}) {
  if (!env.teamsBotInteractive) return false;
  return isBotConfigured(options);
}

function clearBotCredentialsCache() {
  cache = null;
  cacheAt = 0;
  allCache = null;
  allCacheAt = 0;
}

module.exports = {
  getBotCredentials,
  isBotConfigured,
  isBotInteractiveEnabled,
  clearBotCredentialsCache,
  credentialsFromEnv,
  credentialsFromAzureTenantById,
  credentialsFromAppId,
  listBotCredentials,
};
