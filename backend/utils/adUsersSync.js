const db = require("../config/db");
const { child } = require("../config/logger");
const { decrypt } = require("../config/cryptoSecrets");
const {
  getApplicationToken,
  listDirectoryUsersPage,
} = require("./microsoftGraph");
const { syncUserProfileFromGraph, resolveDepartment } = require("./userProfileSync");
const { hasValidDepartment } = require("./userDepartment");
const gatewayApi = require("./authGatewayApi");

const logger = child({ module: "ad-users-sync" });

let syncInProgress = false;
let lastSyncResult = null;

function normalizeGraphUser(graphUser) {
  const email = String(graphUser.mail || graphUser.userPrincipalName || "")
    .trim()
    .toLowerCase();
  if (!email || !graphUser.id) return null;
  if (graphUser.userType && graphUser.userType !== "Member") return null;

  const departamento = resolveDepartment(graphUser);
  if (!hasValidDepartment(departamento)) return null;

  return {
    microsoftId: graphUser.id,
    email,
    nomeCompleto: graphUser.displayName || email.split("@")[0],
    departamento,
    accountEnabled: graphUser.accountEnabled !== false,
  };
}

async function upsertAdUser(adUser) {
  // Pré-cadastro sem perfil: quem libera o acesso é o administrador do Credenciamento.
  const defaultProfileId = null;

  const [byOid] = await db.execute(
    "SELECT id, ativo, id_perfil FROM usuarios WHERE microsoft_id = ? LIMIT 1",
    [adUser.microsoftId],
  );

  if (byOid.length > 0) {
    await db.execute(
      `UPDATE usuarios SET
         email = ?,
         nome_completo = ?,
         departamento = ?,
         is_ad_user = 1,
         username = ?
       WHERE id = ?`,
      [
        adUser.email,
        adUser.nomeCompleto,
        adUser.departamento,
        adUser.email.split("@")[0],
        byOid[0].id,
      ],
    );
    return { action: "updated", userId: byOid[0].id };
  }

  const [byEmail] = await db.execute(
    "SELECT id, microsoft_id, is_ad_user FROM usuarios WHERE email = ? LIMIT 1",
    [adUser.email],
  );

  if (byEmail.length > 0) {
    await db.execute(
      `UPDATE usuarios SET
         microsoft_id = ?,
         nome_completo = ?,
         departamento = ?,
         is_ad_user = 1,
         username = ?
       WHERE id = ?`,
      [
        adUser.microsoftId,
        adUser.nomeCompleto,
        adUser.departamento,
        adUser.email.split("@")[0],
        byEmail[0].id,
      ],
    );
    return { action: "linked", userId: byEmail[0].id };
  }

  const [result] = await db.execute(
    `INSERT INTO usuarios (username, nome_completo, email, departamento, is_ad_user, senha_hash, id_perfil, ativo, microsoft_id)
     VALUES (?, ?, ?, ?, 1, NULL, ?, ?, ?)`,
    [
      adUser.email.split("@")[0],
      adUser.nomeCompleto,
      adUser.email,
      adUser.departamento,
      defaultProfileId,
      adUser.accountEnabled ? 1 : 0,
      adUser.microsoftId,
    ],
  );

  return { action: "created", userId: result.insertId };
}

async function syncTenantAdUsers(tenantRow) {
  let clientSecret;
  try {
    clientSecret = decrypt(tenantRow.client_secret_ciphertext);
  } catch (err) {
    return {
      ok: false,
      tenantId: tenantRow.azure_tenant_id,
      tenantName: tenantRow.nome,
      message: "Falha ao descriptografar client secret.",
    };
  }

  const token = await getApplicationToken(
    tenantRow.azure_tenant_id,
    tenantRow.client_id,
    clientSecret,
  );
  if (!token) {
    return {
      ok: false,
      tenantId: tenantRow.azure_tenant_id,
      tenantName: tenantRow.nome,
      message: "Falha ao obter token do Graph.",
    };
  }

  let nextUrl = null;
  let created = 0;
  let updated = 0;
  let linked = 0;
  let skipped = 0;
  let pages = 0;

  do {
    const page = await listDirectoryUsersPage(token, nextUrl);
    if (!page.ok) {
      return {
        ok: false,
        tenantId: tenantRow.azure_tenant_id,
        tenantName: tenantRow.nome,
        message: page.message,
      };
    }

    pages += 1;
    for (const graphUser of page.users) {
      const adUser = normalizeGraphUser(graphUser);
      if (!adUser) {
        skipped += 1;
        continue;
      }

      try {
        const result = await upsertAdUser(adUser);
        if (result.action === "created") created += 1;
        else if (result.action === "linked") linked += 1;
        else updated += 1;
      } catch (err) {
        logger.warn(
          { err, email: adUser.email, tenantId: tenantRow.azure_tenant_id },
          "Falha ao upsert usuário AD",
        );
        skipped += 1;
      }
    }

    nextUrl = page.nextLink;
  } while (nextUrl);

  return {
    ok: true,
    tenantId: tenantRow.azure_tenant_id,
    tenantName: tenantRow.nome,
    pages,
    created,
    updated,
    linked,
    skipped,
    total: created + updated + linked + skipped,
  };
}

/** Pessoa do diretório do gateway no mesmo formato de normalizeGraphUser. */
function normalizeGatewayUser(person) {
  const email = String(person.mail || person.upn || "").trim().toLowerCase();
  if (!email || !person.oid) return null;
  // Convidado externo (B2B) não é funcionário: fica de fora, como no Graph (userType Member).
  if (String(person.upn || "").includes("#EXT#")) return null;
  const departamento = resolveDepartment(person);
  if (!hasValidDepartment(departamento)) return null;
  return {
    microsoftId: person.oid,
    email,
    nomeCompleto: person.displayName || email.split("@")[0],
    departamento,
    accountEnabled: person.accountEnabled !== false,
  };
}

/**
 * Sincronização pelo diretório do auth-gateway (sem Graph): incremental por `changedSince`.
 * Conta desativada ou removida no Entra é desativada aqui; quem já existe não é reativado sozinho.
 */
async function syncFromGateway(triggeredBy, startedAt) {
  const [[settings]] = await db.execute(
    "SELECT directory_sync_since FROM system_settings WHERE id = 1",
  );
  const since = settings?.directory_sync_since || null;
  const { users, serverTime } = await gatewayApi.listDirectoryUsers({ changedSince: since });

  const counts = { created: 0, updated: 0, linked: 0, skipped: 0, deactivated: 0 };
  for (const person of users) {
    try {
      if (person.deleted || person.accountEnabled === false) {
        const [res] = await db.execute(
          "UPDATE usuarios SET ativo = 0 WHERE microsoft_id = ? AND ativo = 1",
          [person.oid],
        );
        counts.deactivated += res.affectedRows;
        continue;
      }
      const adUser = normalizeGatewayUser(person);
      if (!adUser) {
        counts.skipped += 1;
        continue;
      }
      const result = await upsertAdUser(adUser);
      if (result.action === "created") counts.created += 1;
      else if (result.action === "linked") counts.linked += 1;
      else counts.updated += 1;
    } catch (err) {
      counts.skipped += 1;
      logger.warn({ err: err.message, oid: person.oid }, "Falha ao sincronizar pessoa do diretório");
    }
  }

  if (serverTime) {
    await db.execute("UPDATE system_settings SET directory_sync_since = ? WHERE id = 1", [serverTime]);
  }
  const result = {
    ok: true,
    source: "auth-gateway",
    triggeredBy,
    incremental: !!since,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    received: users.length,
    ...counts,
  };
  logger.info(result, "Sync do diretório (gateway) concluída");
  return result;
}

async function runAdUsersSync({ triggeredBy = "manual" } = {}) {
  if (syncInProgress) {
    logger.warn({ triggeredBy }, "Sincronização AD já em execução — ignorando");
    return { ok: false, message: "Sincronização já em execução.", alreadyRunning: true };
  }

  syncInProgress = true;
  const startedAt = new Date();

  try {
    if (gatewayApi.isConfigured()) {
      const result = await syncFromGateway(triggeredBy, startedAt);
      lastSyncResult = result;
      return result;
    }

    const [tenants] = await db.execute(
      `SELECT id, nome, azure_tenant_id, client_id, client_secret_ciphertext
       FROM azure_tenants
       WHERE ativo = 1 AND client_secret_ciphertext IS NOT NULL
       ORDER BY eh_principal DESC, id ASC`,
    );

    if (tenants.length === 0) {
      const empty = {
        ok: false,
        triggeredBy,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        message: "Nenhum tenant Azure ativo configurado.",
        tenants: [],
      };
      lastSyncResult = empty;
      return empty;
    }

    const results = [];
    for (const tenant of tenants) {
      const result = await syncTenantAdUsers(tenant);
      results.push(result);
      if (result.ok) {
        logger.info(
          {
            tenant: result.tenantName,
            created: result.created,
            updated: result.updated,
            linked: result.linked,
            skipped: result.skipped,
          },
          "Tenant AD sincronizado",
        );
      } else {
        logger.error({ tenant: result.tenantName, message: result.message }, "Falha sync tenant AD");
      }
    }

    const summary = results.reduce(
      (acc, r) => {
        if (!r.ok) {
          acc.failedTenants += 1;
          return acc;
        }
        acc.created += r.created || 0;
        acc.updated += r.updated || 0;
        acc.linked += r.linked || 0;
        acc.skipped += r.skipped || 0;
        acc.syncedTenants += 1;
        return acc;
      },
      { syncedTenants: 0, failedTenants: 0, created: 0, updated: 0, linked: 0, skipped: 0 },
    );

    logger.info({ triggeredBy, ...summary, durationMs: Date.now() - startedAt.getTime() }, "Sync AD concluída");

    const result = {
      ok: summary.failedTenants === 0,
      triggeredBy,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      ...summary,
      tenants: results,
    };
    lastSyncResult = result;
    return result;
  } finally {
    syncInProgress = false;
  }
}

function getAdUsersSyncStatus() {
  const env = require("../config/env");
  return {
    enabled: env.adUsersSyncEnabled,
    cron: env.adUsersSyncCron,
    timezone: env.adUsersSyncTimezone,
    intervalLabel: "1 hora",
    running: syncInProgress,
    last: lastSyncResult,
  };
}

module.exports = {
  runAdUsersSync,
  syncTenantAdUsers,
  normalizeGraphUser,
  normalizeGatewayUser,
  getAdUsersSyncStatus,
};
