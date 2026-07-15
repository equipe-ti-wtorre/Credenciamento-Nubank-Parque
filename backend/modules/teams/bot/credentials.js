"use strict";

/**
 * Credenciais do Bot Teams.
 * Prioridade:
 * 1. TEAMS_BOT_APP_ID + TEAMS_BOT_APP_PASSWORD (+ TEAMS_BOT_TENANT_ID opcional) no .env
 * 2. Tenant principal (ou primeiro ativo) em Configurações → Tenants Azure
 */

const db = require("../../../config/db");
const { decrypt } = require("../../../config/cryptoSecrets");
const env = require("../../../config/env");
const { child } = require("../../../config/logger");

const log = child({ module: "teams.bot.credentials" });

let cache = null;
let cacheAt = 0;
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

/**
 * @param {{ force?: boolean, azureTenantRefId?: number }} [options]
 * @returns {Promise<null | {
 *   appId: string,
 *   appPassword: string,
 *   tenantId: string | null,
 *   source: 'env' | 'azure_tenant',
 *   label: string,
 *   azureTenantRefId?: number
 * }>}
 */
async function getBotCredentials({ force = false, azureTenantRefId } = {}) {
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

function clearBotCredentialsCache() {
  cache = null;
  cacheAt = 0;
}

module.exports = {
  getBotCredentials,
  isBotConfigured,
  clearBotCredentialsCache,
  credentialsFromEnv,
  credentialsFromAzureTenantById,
};
