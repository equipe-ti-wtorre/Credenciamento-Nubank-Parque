const axios = require("axios");
const qs = require("qs");
const db = require("../../config/db");
const { encrypt, decrypt } = require("../../config/cryptoSecrets");
const env = require("../../config/env");
const { child } = require("../../config/logger");

const logger = child({ module: "tenants" });
const MSAL_AUTHORITY = "https://login.microsoftonline.com/common";

function mapTenantRow(row, includeSecret = false) {
  const base = {
    id: row.id,
    nome: row.nome,
    azure_tenant_id: row.azure_tenant_id,
    client_id: row.client_id,
    ativo: !!row.ativo,
    eh_principal: !!row.eh_principal,
    hasSecret: !!row.client_secret_ciphertext,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
  if (includeSecret && row.client_secret_ciphertext) {
    try {
      base.client_secret = decrypt(row.client_secret_ciphertext);
    } catch {
      base.client_secret = null;
    }
  }
  return base;
}

async function clearOtherPrincipal(exceptId = null) {
  if (exceptId) {
    await db.execute("UPDATE azure_tenants SET eh_principal = 0 WHERE id != ?", [exceptId]);
  } else {
    await db.execute("UPDATE azure_tenants SET eh_principal = 0");
  }
}

async function getActiveTenantsForConfig() {
  const [rows] = await db.execute(
    `SELECT id, nome, azure_tenant_id, client_id, client_secret_ciphertext
     FROM azure_tenants WHERE ativo = 1`,
  );
  return rows.map((r) => ({
    label: r.nome,
    tenantId: r.azure_tenant_id,
    clientId: r.client_id,
    clientSecret: r.client_secret_ciphertext ? decrypt(r.client_secret_ciphertext) : null,
  }));
}

async function getMsalConfig(clientType = "web") {
  const [rows] = await db.execute(
    `SELECT client_id FROM azure_tenants WHERE ativo = 1 AND eh_principal = 1 LIMIT 1`,
  );
  let clientId;
  if (rows.length === 0) {
    const [fallback] = await db.execute(
      `SELECT client_id FROM azure_tenants WHERE ativo = 1 ORDER BY id ASC LIMIT 1`,
    );
    if (fallback.length === 0) return null;
    clientId = fallback[0].client_id;
  } else {
    clientId = rows[0].client_id;
  }

  const redirectUris = {
    web: env.msalRedirectUriWeb || null,
    android: env.msalRedirectUriAndroid || null,
    ios: env.msalRedirectUriIos || null,
  };

  return {
    clientId,
    authority: MSAL_AUTHORITY,
    redirectUris,
    redirectUri: redirectUris[clientType] || redirectUris.web,
  };
}

async function testTenantConnection(config) {
  const item = {
    label: config.label,
    tenantId: config.tenantId,
    status: "error",
    message: null,
    userCount: null,
  };

  if (!config.clientSecret) {
    item.message = "Client secret não configurado.";
    return item;
  }

  try {
    const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
    const tokenData = qs.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });
    const tokenResponse = await axios.post(tokenUrl, tokenData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (tokenResponse.status !== 200 || !tokenResponse.data?.access_token) {
      item.message = "Falha ao obter token OAuth";
      return item;
    }

    const graphResponse = await axios.get(
      "https://graph.microsoft.com/v1.0/users?$top=1&$select=id",
      {
        headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` },
        validateStatus: () => true,
      },
    );

    if (graphResponse.status === 200 && Array.isArray(graphResponse.data?.value)) {
      item.status = "ok";
      item.message = "Conectado e com permissão para listar usuários (User.Read.All)";
    } else {
      const msg =
        graphResponse.data?.error?.message ||
        graphResponse.statusText ||
        `HTTP ${graphResponse.status}`;
      item.message = `${graphResponse.status}: ${msg}`;
    }
  } catch (err) {
    logger.error({ err }, "Falha ao testar conexão tenant");
    item.message = err.response?.data?.error_description || err.message || "Erro ao conectar";
  }

  return item;
}

async function getTenantsStatus() {
  const configs = await getActiveTenantsForConfig();
  const results = [];
  for (const config of configs) {
    results.push(await testTenantConnection(config));
  }
  return results;
}

async function findTenantById(id) {
  const [rows] = await db.execute("SELECT * FROM azure_tenants WHERE id = ?", [id]);
  return rows[0] || null;
}

async function listTenants() {
  const [rows] = await db.execute(
    "SELECT * FROM azure_tenants ORDER BY eh_principal DESC, nome ASC",
  );
  return rows.map((r) => mapTenantRow(r));
}

async function createTenant(data) {
  if (data.eh_principal) await clearOtherPrincipal();

  const ciphertext = data.client_secret ? encrypt(data.client_secret) : null;
  const [result] = await db.execute(
    `INSERT INTO azure_tenants (nome, azure_tenant_id, client_id, client_secret_ciphertext, ativo, eh_principal)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.nome,
      data.azure_tenant_id,
      data.client_id,
      ciphertext,
      data.ativo ? 1 : 0,
      data.eh_principal ? 1 : 0,
    ],
  );
  return findTenantById(result.insertId);
}

async function updateTenant(id, data) {
  const existing = await findTenantById(id);
  if (!existing) return null;

  if (data.eh_principal) await clearOtherPrincipal(id);

  const nome = data.nome ?? existing.nome;
  const azure_tenant_id = data.azure_tenant_id ?? existing.azure_tenant_id;
  const client_id = data.client_id ?? existing.client_id;
  const ativo = data.ativo !== undefined ? (data.ativo ? 1 : 0) : existing.ativo;
  const eh_principal =
    data.eh_principal !== undefined ? (data.eh_principal ? 1 : 0) : existing.eh_principal;

  let ciphertext = existing.client_secret_ciphertext;
  if (data.client_secret) {
    ciphertext = encrypt(data.client_secret);
  }

  await db.execute(
    `UPDATE azure_tenants SET nome=?, azure_tenant_id=?, client_id=?, client_secret_ciphertext=?, ativo=?, eh_principal=? WHERE id=?`,
    [nome, azure_tenant_id, client_id, ciphertext, ativo, eh_principal, id],
  );
  return findTenantById(id);
}

async function deactivateTenant(id) {
  await db.execute("UPDATE azure_tenants SET ativo = 0, eh_principal = 0 WHERE id = ?", [id]);
}

module.exports = {
  mapTenantRow,
  getMsalConfig,
  getTenantsStatus,
  listTenants,
  findTenantById,
  createTenant,
  updateTenant,
  deactivateTenant,
};
