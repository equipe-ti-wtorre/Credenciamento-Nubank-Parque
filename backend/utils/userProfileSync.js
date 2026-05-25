const db = require("../config/db");
const { decrypt } = require("../config/cryptoSecrets");
const { child } = require("../config/logger");
const { getApplicationToken, fetchUserProfileById } = require("./microsoftGraph");

const logger = child({ module: "user-profile-sync" });

function resolveDepartment(profile) {
  if (!profile) return null;
  const candidates = [
    profile.department,
    profile.companyName,
    profile.officeLocation,
    profile.jobTitle,
  ];
  for (const value of candidates) {
    const trimmed = value != null ? String(value).trim() : "";
    if (trimmed) return trimmed;
  }
  return null;
}

async function getActiveTenantsOrdered(preferredAzureTenantId = null) {
  const [rows] = await db.execute(
    `SELECT azure_tenant_id, client_id, client_secret_ciphertext, eh_principal
     FROM azure_tenants
     WHERE ativo = 1 AND client_secret_ciphertext IS NOT NULL`,
  );

  const tenants = [];
  for (const row of rows) {
    let clientSecret;
    try {
      clientSecret = decrypt(row.client_secret_ciphertext);
    } catch {
      continue;
    }
    if (!clientSecret) continue;
    tenants.push({ ...row, clientSecret });
  }

  return tenants.sort((a, b) => {
    if (preferredAzureTenantId) {
      if (a.azure_tenant_id === preferredAzureTenantId) return -1;
      if (b.azure_tenant_id === preferredAzureTenantId) return 1;
    }
    return (b.eh_principal || 0) - (a.eh_principal || 0);
  });
}

async function syncUserProfileFromGraph(userId, microsoftId, preferredAzureTenantId = null) {
  if (!userId || !microsoftId) {
    return { ok: false, message: "Usuário sem vínculo Microsoft." };
  }

  const tenants = await getActiveTenantsOrdered(preferredAzureTenantId);
  if (tenants.length === 0) {
    return { ok: false, message: "Nenhum tenant Azure ativo com secret configurado." };
  }

  let lastError = "Usuário não encontrado em nenhum tenant Azure cadastrado.";

  for (const tenant of tenants) {
    const token = await getApplicationToken(
      tenant.azure_tenant_id,
      tenant.client_id,
      tenant.clientSecret,
    );
    if (!token) {
      lastError = "Falha ao obter token do Graph.";
      continue;
    }

    const result = await fetchUserProfileById(token, microsoftId);
    if (!result.ok) {
      lastError = result.message;
      continue;
    }

    const department = resolveDepartment(result.profile);
    const displayName = result.profile?.displayName || null;

    await db.execute(
      `UPDATE usuarios SET departamento = ?, nome_completo = COALESCE(?, nome_completo) WHERE id = ?`,
      [department, displayName, userId],
    );

    logger.info(
      { userId, microsoftId, department, tenantId: tenant.azure_tenant_id },
      "Perfil Microsoft sincronizado",
    );

    return { ok: true, department, displayName };
  }

  logger.warn({ userId, microsoftId, lastError }, "Falha ao sincronizar perfil Microsoft");
  return { ok: false, message: lastError };
}

/** Busca perfil no Graph sem persistir (uso no login). */
async function fetchMicrosoftProfile(microsoftId, preferredAzureTenantId = null) {
  const tenants = await getActiveTenantsOrdered(preferredAzureTenantId);
  let lastError = "Usuário não encontrado no Azure AD.";

  for (const tenant of tenants) {
    const token = await getApplicationToken(
      tenant.azure_tenant_id,
      tenant.client_id,
      tenant.clientSecret,
    );
    if (!token) continue;

    const result = await fetchUserProfileById(token, microsoftId);
    if (!result.ok) {
      lastError = result.message;
      continue;
    }

    return {
      ok: true,
      departamento: resolveDepartment(result.profile),
      displayName: result.profile?.displayName || null,
    };
  }

  return { ok: false, message: lastError };
}

async function syncMissingDepartments({ limit = 50 } = {}) {
  const [users] = await db.execute(
    `SELECT id, microsoft_id FROM usuarios
     WHERE is_ad_user = 1
       AND microsoft_id IS NOT NULL
       AND (departamento IS NULL OR departamento = '')
     ORDER BY id ASC
     LIMIT ?`,
    [limit],
  );

  let synced = 0;
  let failed = 0;
  const errors = [];

  for (const user of users) {
    const result = await syncUserProfileFromGraph(user.id, user.microsoft_id);
    if (result.ok) synced += 1;
    else {
      failed += 1;
      errors.push({ userId: user.id, message: result.message });
    }
  }

  return { total: users.length, synced, failed, errors };
}

module.exports = {
  syncUserProfileFromGraph,
  syncMissingDepartments,
  fetchMicrosoftProfile,
  resolveDepartment,
};
