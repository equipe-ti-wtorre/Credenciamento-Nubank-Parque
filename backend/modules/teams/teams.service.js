const db = require("../../config/db");
const { decrypt } = require("../../config/cryptoSecrets");
const { child } = require("../../config/logger");
const env = require("../../config/env");
const {
  getApplicationToken,
  postChannelMessage,
  sendUserActivityNotification,
  normalizeHttpsAppUrl,
} = require("../../utils/microsoftGraph");

const logger = child({ module: "teams" });

function mapIntegrationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    tipo: row.tipo || "user",
    azure_tenant_ref_id: row.azure_tenant_ref_id,
    azure_tenant_nome: row.azure_tenant_nome || null,
    azure_tenant_id: row.azure_tenant_id || null,
    team_id: row.team_id || null,
    channel_id: row.channel_id || null,
    destinatario_email: row.destinatario_email || null,
    activity_web_url: row.activity_web_url || null,
    teams_app_id: row.teams_app_id || null,
    ativo: !!row.ativo,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function normalizePayload(data) {
  const tipo = data.tipo === "channel" ? "channel" : "user";
  let activityWebUrl = null;
  if (tipo === "user" && data.activity_web_url) {
    activityWebUrl = normalizeHttpsAppUrl(String(data.activity_web_url).trim());
  }
  let teamsAppId = null;
  if (tipo === "user" && data.teams_app_id != null && String(data.teams_app_id).trim()) {
    teamsAppId = String(data.teams_app_id).trim();
  }
  return {
    nome: data.nome,
    tipo,
    azure_tenant_ref_id: data.azure_tenant_ref_id,
    team_id: tipo === "channel" ? data.team_id : null,
    channel_id: tipo === "channel" ? data.channel_id : null,
    destinatario_email: tipo === "user" ? data.destinatario_email : null,
    activity_web_url: activityWebUrl,
    teams_app_id: teamsAppId,
    ativo: data.ativo !== false,
  };
}

function resolveTeamsAppId(row) {
  return row.teams_app_id || env.teamsAppId || null;
}

function resolveActivityWebUrl(row) {
  return (
    row.activity_web_url ||
    env.teamsActivityWebUrl ||
    null
  );
}

async function findTenantCredentials(tenantRefId) {
  const [rows] = await db.execute(
    `SELECT id, nome, azure_tenant_id, client_id, client_secret_ciphertext, ativo
     FROM azure_tenants WHERE id = ?`,
    [tenantRefId],
  );
  const row = rows[0];
  if (!row || !row.ativo) return null;
  if (!row.client_secret_ciphertext) return null;
  try {
    return {
      label: row.nome,
      tenantId: row.azure_tenant_id,
      clientId: row.client_id,
      clientSecret: decrypt(row.client_secret_ciphertext),
    };
  } catch {
    return null;
  }
}

async function getTokenForIntegration(row) {
  const creds = await findTenantCredentials(row.azure_tenant_ref_id);
  if (!creds) {
    return { ok: false, message: "Tenant Azure inativo ou sem client secret configurado." };
  }

  const token = await getApplicationToken(
    creds.tenantId,
    creds.clientId,
    creds.clientSecret,
  );
  if (!token) {
    return { ok: false, message: "Falha ao obter token OAuth do tenant." };
  }

  return { ok: true, token, creds };
}

async function findById(id) {
  const [rows] = await db.execute(
    `SELECT ti.*, at.nome AS azure_tenant_nome, at.azure_tenant_id
     FROM teams_integrations ti
     JOIN azure_tenants at ON at.id = ti.azure_tenant_ref_id
     WHERE ti.id = ?`,
    [id],
  );
  return rows[0] || null;
}

async function listIntegrations() {
  const [rows] = await db.execute(
    `SELECT ti.*, at.nome AS azure_tenant_nome, at.azure_tenant_id
     FROM teams_integrations ti
     JOIN azure_tenants at ON at.id = ti.azure_tenant_ref_id
     ORDER BY ti.nome ASC`,
  );
  return rows.map((r) => mapIntegrationRow(r));
}

async function createIntegration(data) {
  const payload = normalizePayload(data);
  const creds = await findTenantCredentials(payload.azure_tenant_ref_id);
  if (!creds) {
    throw new Error("Tenant Azure inválido, inativo ou sem client secret.");
  }

  const [result] = await db.execute(
    `INSERT INTO teams_integrations (nome, tipo, azure_tenant_ref_id, team_id, channel_id, destinatario_email, activity_web_url, teams_app_id, ativo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.nome,
      payload.tipo,
      payload.azure_tenant_ref_id,
      payload.team_id,
      payload.channel_id,
      payload.destinatario_email,
      payload.activity_web_url,
      payload.teams_app_id,
      payload.ativo ? 1 : 0,
    ],
  );
  return findById(result.insertId);
}

async function updateIntegration(id, data) {
  const existing = await findById(id);
  if (!existing) return null;

  const merged = normalizePayload({
    nome: data.nome ?? existing.nome,
    tipo: data.tipo ?? existing.tipo,
    azure_tenant_ref_id: data.azure_tenant_ref_id ?? existing.azure_tenant_ref_id,
    team_id: data.team_id !== undefined ? data.team_id : existing.team_id,
    channel_id: data.channel_id !== undefined ? data.channel_id : existing.channel_id,
    destinatario_email:
      data.destinatario_email !== undefined
        ? data.destinatario_email
        : existing.destinatario_email,
    activity_web_url:
      data.activity_web_url !== undefined
        ? data.activity_web_url
        : existing.activity_web_url,
    teams_app_id:
      data.teams_app_id !== undefined ? data.teams_app_id : existing.teams_app_id,
    ativo: data.ativo !== undefined ? data.ativo : existing.ativo,
  });

  if (data.azure_tenant_ref_id !== undefined) {
    const creds = await findTenantCredentials(merged.azure_tenant_ref_id);
    if (!creds) {
      throw new Error("Tenant Azure inválido, inativo ou sem client secret.");
    }
  }

  await db.execute(
    `UPDATE teams_integrations
     SET nome=?, tipo=?, azure_tenant_ref_id=?, team_id=?, channel_id=?, destinatario_email=?, activity_web_url=?, teams_app_id=?, ativo=?
     WHERE id=?`,
    [
      merged.nome,
      merged.tipo,
      merged.azure_tenant_ref_id,
      merged.team_id,
      merged.channel_id,
      merged.destinatario_email,
      merged.activity_web_url,
      merged.teams_app_id,
      merged.ativo ? 1 : 0,
      id,
    ],
  );
  return findById(id);
}

async function deactivateIntegration(id) {
  await db.execute("UPDATE teams_integrations SET ativo = 0 WHERE id = ?", [id]);
}

async function sendNotification(integrationId, { email, mensagem } = {}) {
  const row = await findById(integrationId);
  if (!row || !row.ativo) {
    return { ok: false, message: "Integração não encontrada ou inativa." };
  }

  const auth = await getTokenForIntegration(row);
  if (!auth.ok) return auth;

  const content =
    mensagem ||
    `Notificação WTORRE Credenciamento — ${new Date().toLocaleString("pt-BR")}`;

  const tipo = row.tipo || "user";

  if (tipo === "channel") {
    if (!row.team_id || !row.channel_id) {
      return { ok: false, message: "Integração de canal sem Team ID ou Channel ID." };
    }
    const result = await postChannelMessage(
      auth.token,
      row.team_id,
      row.channel_id,
      content,
    );
    if (result.ok) {
      return { ok: true, message: "Mensagem enviada ao canal do Teams." };
    }
    return {
      ok: false,
      message: `Graph API: ${result.message}. Verifique ChannelMessage.Send.`,
    };
  }

  const targetEmail = email || row.destinatario_email;
  if (!targetEmail) {
    return { ok: false, message: "Informe o e-mail do destinatário." };
  }

  const webUrl = resolveActivityWebUrl(row);
  if (!webUrl) {
    return {
      ok: false,
      message: "Configure a URL https da notificação no cadastro da integração Teams.",
    };
  }

  const [tenantRows] = await db.execute(
    "SELECT client_id FROM azure_tenants WHERE id = ?",
    [row.azure_tenant_ref_id],
  );
  const azureClientId = tenantRows[0]?.client_id || null;

  const result = await sendUserActivityNotification(
    auth.token,
    targetEmail,
    content,
    webUrl,
    {
      teamsAppId: resolveTeamsAppId(row),
      teamsAppExternalId: env.teamsAppExternalId,
      azureClientId,
    },
  );
  if (result.ok) {
    return { ok: true, message: result.message };
  }

  return { ok: false, message: result.message };
}

async function testIntegration(id, options = {}) {
  return sendNotification(id, {
    email: options.email,
    mensagem: options.mensagem,
  });
}

/** Envia notificação ao usuário usando a primeira integração ativa do tipo user. */
async function notifyUser(email, mensagem) {
  const [rows] = await db.execute(
    `SELECT id FROM teams_integrations WHERE ativo = 1 AND tipo = 'user' ORDER BY id ASC LIMIT 1`,
  );
  if (rows.length === 0) {
    return { ok: false, message: "Nenhuma integração Teams (usuário) ativa configurada." };
  }
  return sendNotification(rows[0].id, { email, mensagem });
}

module.exports = {
  mapIntegrationRow,
  listIntegrations,
  findById,
  createIntegration,
  updateIntegration,
  deactivateIntegration,
  testIntegration,
  sendNotification,
  notifyUser,
};
