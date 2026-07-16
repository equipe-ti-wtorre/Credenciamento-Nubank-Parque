const axios = require("axios");
const qs = require("qs");
const env = require("../config/env");

async function getApplicationToken(tenantId, clientId, clientSecret) {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const tokenData = qs.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const tokenResponse = await axios.post(tokenUrl, tokenData, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    validateStatus: () => true,
  });

  if (tokenResponse.status !== 200 || !tokenResponse.data?.access_token) {
    return null;
  }
  return tokenResponse.data.access_token;
}

function graphErrorMessage(response) {
  return (
    response.data?.error?.message ||
    response.statusText ||
    `HTTP ${response.status}`
  );
}

async function resolveUserByEmail(accessToken, email) {
  const normalized = String(email).trim().toLowerCase();
  const escaped = normalized.replace(/'/g, "''");
  const url =
    `https://graph.microsoft.com/v1.0/users?$filter=` +
    `mail eq '${escaped}' or userPrincipalName eq '${escaped}'` +
    `&$select=id,displayName,mail,userPrincipalName`;

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    validateStatus: () => true,
  });

  if (response.status !== 200) {
    return { ok: false, message: graphErrorMessage(response) };
  }

  const user = response.data?.value?.[0];
  if (!user?.id) {
    return { ok: false, message: `Usuário não encontrado no Azure AD: ${email}` };
  }

  return { ok: true, user };
}

async function fetchUserProfileById(accessToken, microsoftUserId) {
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(microsoftUserId)}` +
    `?$select=id,displayName,mail,department,jobTitle,companyName,officeLocation`;

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    validateStatus: () => true,
  });

  if (response.status !== 200) {
    return { ok: false, message: graphErrorMessage(response) };
  }

  return { ok: true, profile: response.data };
}

const AD_USER_SELECT =
  "id,displayName,mail,userPrincipalName,department,jobTitle,companyName,officeLocation,accountEnabled,userType";

async function listDirectoryUsersPage(accessToken, nextUrl = null) {
  const url =
    nextUrl ||
    `https://graph.microsoft.com/v1.0/users?$select=${AD_USER_SELECT}&$top=999`;

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    validateStatus: () => true,
  });

  if (response.status !== 200) {
    return { ok: false, message: graphErrorMessage(response) };
  }

  return {
    ok: true,
    users: response.data?.value || [],
    nextLink: response.data?.["@odata.nextLink"] || null,
  };
}

async function createOneOnOneChat(accessToken, userId) {
  const response = await axios.post(
    "https://graph.microsoft.com/v1.0/chats",
    {
      chatType: "oneOnOne",
      members: [
        {
          "@odata.type": "#microsoft.graph.aadUserConversationMember",
          roles: ["owner"],
          "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${userId}')`,
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    },
  );

  if (response.status >= 200 && response.status < 300 && response.data?.id) {
    return { ok: true, chatId: response.data.id };
  }

  return { ok: false, message: graphErrorMessage(response), status: response.status };
}

async function findExistingOneOnOneChat(accessToken, userId) {
  const url = `https://graph.microsoft.com/v1.0/users/${userId}/chats?$filter=chatType eq 'oneOnOne'&$top=1`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    validateStatus: () => true,
  });

  if (response.status === 200 && response.data?.value?.[0]?.id) {
    return { ok: true, chatId: response.data.value[0].id };
  }

  return { ok: false };
}

async function getOrCreateOneOnOneChat(accessToken, userId) {
  const existing = await findExistingOneOnOneChat(accessToken, userId);
  if (existing.ok) return existing;

  const created = await createOneOnOneChat(accessToken, userId);
  if (created.ok) return created;

  if (created.status === 409) {
    const retry = await findExistingOneOnOneChat(accessToken, userId);
    if (retry.ok) return retry;
  }

  return created;
}

async function postChatMessage(accessToken, chatId, content) {
  const url = `https://graph.microsoft.com/v1.0/chats/${chatId}/messages`;
  const response = await axios.post(
    url,
    { body: { content } },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    },
  );

  if (response.status >= 200 && response.status < 300) {
    return { ok: true, data: response.data };
  }

  return { ok: false, message: graphErrorMessage(response), status: response.status };
}

/** Envia Adaptive Card em chat 1:1 via Graph (fallback quando o Bot não está configurado). */
async function postChatAdaptiveCard(accessToken, chatId, adaptiveCard) {
  const attachmentId = String(Date.now());
  const url = `https://graph.microsoft.com/v1.0/chats/${chatId}/messages`;
  const response = await axios.post(
    url,
    {
      body: {
        contentType: "html",
        content: `<attachment id="${attachmentId}"></attachment>`,
      },
      attachments: [
        {
          id: attachmentId,
          contentType: "application/vnd.microsoft.card.adaptive",
          content: adaptiveCard,
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    },
  );

  if (response.status >= 200 && response.status < 300) {
    return { ok: true, data: response.data };
  }

  return { ok: false, message: graphErrorMessage(response), status: response.status };
}

async function sendUserAdaptiveCard(accessToken, email, adaptiveCard) {
  const resolved = await resolveUserByEmail(accessToken, email);
  if (!resolved.ok) return resolved;

  const chat = await getOrCreateOneOnOneChat(accessToken, resolved.user.id);
  if (!chat.ok) {
    return {
      ok: false,
      message: `Não foi possível abrir chat 1:1: ${chat.message}`,
      user: resolved.user,
    };
  }

  const sent = await postChatAdaptiveCard(accessToken, chat.chatId, adaptiveCard);
  if (!sent.ok) {
    return {
      ok: false,
      message: `Falha ao enviar Adaptive Card: ${sent.message}`,
      user: resolved.user,
    };
  }

  return {
    ok: true,
    user: resolved.user,
    chatId: chat.chatId,
    message: `Adaptive Card enviada para ${resolved.user.displayName || email}.`,
  };
}

const TEAMS_DEEP_LINK_RE =
  /^https:\/\/(teams\.microsoft\.com|teams\.live\.com)\/l\//i;
const TEAMS_HOST_RE = /^(teams\.microsoft\.com|teams\.live\.com)$/i;
const TEAMS_MANIFEST_APP_ID_DEFAULT = "c8f4a2b1-6d3e-4f5a-9b0c-1e2d3f4a5b6c";
const TEAMS_STATIC_TAB_ENTITY_ID = "home";

/** Normaliza URL do app (armazenamento / formulário) — apenas https. */
function normalizeHttpsAppUrl(url) {
  const raw = (url || "").trim();
  if (!raw) return null;
  if (raw.startsWith("https://")) return raw.replace(/\/$/, "") || null;
  if (raw.startsWith("http://")) {
    try {
      const u = new URL(raw);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return null;
      u.protocol = "https:";
      return u.toString().replace(/\/$/, "") || null;
    } catch {
      return null;
    }
  }
  const normalized = `https://${raw.replace(/^\/+/, "")}`;
  return normalized.replace(/\/$/, "") || null;
}

/** @deprecated alias — use normalizeHttpsAppUrl */
function normalizeTeamsWebUrl(url) {
  return normalizeHttpsAppUrl(url);
}

/**
 * Graph exige topic.webUrl como deep link Teams (…/l/…).
 * Usa o id do manifest (externalId do pacote) + aba estática — não o web tab genérico da Microsoft.
 * Inclui context.subEntityId com o path do SPA (ex.: /aprovacoes/12) para o front navegar.
 */
function buildTeamsActivityWebUrl(url, options = {}) {
  const appUrl = normalizeHttpsAppUrl(url);
  if (appUrl && TEAMS_DEEP_LINK_RE.test(appUrl)) return appUrl;

  const manifestAppId = (
    options.manifestAppId ||
    options.teamsAppExternalId ||
    TEAMS_MANIFEST_APP_ID_DEFAULT
  ).trim();
  const entityId = (options.entityId || TEAMS_STATIC_TAB_ENTITY_ID).trim();
  const entityBase = `https://teams.microsoft.com/l/entity/${manifestAppId}/${entityId}`;
  const label = env.organizationName;

  let subEntityId = null;
  if (appUrl) {
    try {
      const u = new URL(appUrl);
      if (!TEAMS_HOST_RE.test(u.hostname)) {
        subEntityId = `${u.pathname}${u.search}` || null;
        if (subEntityId === "/") subEntityId = null;
      }
    } catch {
      /* ignore */
    }
  }

  const params = new URLSearchParams({ label });
  if (subEntityId) {
    params.set("context", JSON.stringify({ subEntityId }));
  }
  if (appUrl && subEntityId) {
    params.set("webUrl", appUrl);
  }

  return `${entityBase}?${params.toString()}`;
}

const TEAMS_ACTIVITY_TYPE = "credenciamentoAlert";

async function getTeamsCatalogAppStatus(accessToken, catalogAppId) {
  if (!catalogAppId) return { ok: false, message: "Teams App ID não informado." };

  const response = await axios.get(
    `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${catalogAppId}?$expand=appDefinitions($select=version,authorization,publishingState)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      validateStatus: () => true,
    },
  );

  if (response.status < 200 || response.status >= 300) {
    return { ok: false, message: graphErrorMessage(response) };
  }

  const def = response.data?.appDefinitions?.[0];
  const version = def?.version || "?";
  const rsc =
    def?.authorization?.requiredPermissionSet?.resourceSpecificPermissions || [];
  const hasSendUser = rsc.some(
    (p) =>
      (p.permissionValue || p.name || "").toLowerCase() ===
      "teamsactivity.send.user",
  );

  return {
    ok: true,
    version,
    publishingState: def?.publishingState,
    hasSendUserRsc: hasSendUser,
    rscCount: rsc.length,
  };
}

async function resolveTeamsCatalogAppId(accessToken, { teamsAppId, externalId }) {
  const direct = (teamsAppId || "").trim();
  if (direct) return direct;

  const ext = (externalId || "").trim();
  if (!ext) return null;

  const filter = encodeURIComponent(`externalId eq '${ext.replace(/'/g, "''")}'`);
  const listUrl = `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps?$filter=${filter}`;
  const response = await axios.get(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    validateStatus: () => true,
  });

  if (response.status >= 200 && response.status < 300) {
    return response.data?.value?.[0]?.id || null;
  }
  return null;
}

/**
 * @param {string} content Fallback message (also used as activityMessage when not provided).
 * @param {string} safeWebUrl
 * @param {string|null} catalogAppId
 * @param {{ activityActor?: string, activityMessage?: string }} [opts]
 */
function buildActivityNotificationBody(content, safeWebUrl, catalogAppId, opts = {}) {
  const activityMessage = String(opts.activityMessage || content || "").slice(0, 150);
  const activityActor = String(
    opts.activityActor || env.organizationName || "Credenciamento",
  ).slice(0, 50);

  if (catalogAppId) {
    return {
      topic: {
        source: "entityUrl",
        value: `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${catalogAppId}`,
        webUrl: safeWebUrl,
      },
      teamsAppId: catalogAppId,
      activityType: TEAMS_ACTIVITY_TYPE,
      previewText: { content: activityMessage },
      templateParameters: [
        { name: "actor", value: activityActor },
        { name: "message", value: activityMessage },
      ],
    };
  }

  return {
    topic: {
      source: "text",
      value: activityActor,
      webUrl: safeWebUrl,
    },
    activityType: "systemDefault",
    previewText: { content: activityMessage },
  };
}

async function installTeamsAppForUser(accessToken, userId, catalogAppId) {
  const url = `https://graph.microsoft.com/v1.0/users/${userId}/teamwork/installedApps`;
  const response = await axios.post(
    url,
    {
      "teamsApp@odata.bind": `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${catalogAppId}`,
      consentedPermissionSet: {
        resourceSpecificPermissions: [
          {
            permissionValue: "TeamsActivity.Send.User",
            permissionType: "Application",
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    },
  );

  if (response.status >= 200 && response.status < 300) {
    return { ok: true, message: "App Teams instalado para o usuário." };
  }
  if (response.status === 409) {
    return { ok: true, already: true };
  }

  const msg = graphErrorMessage(response);
  const permHint = /TeamsAppInstallation|Missing role permissions|grant consent/i.test(msg)
    ? " No Azure, permissão de APLICAÇÃO TeamsAppInstallation.ReadWriteAndConsentForUser.All (ou instale manualmente no admin do Teams após publicar o zip 1.1.0)."
    : "";

  return { ok: false, message: msg, status: response.status, permHint };
}

function teamsActivityErrorHint(msg, { azureClientId, hasCatalogAppId, installAttempted }) {
  const needsInstall =
    /not authorized|not installed|expected Teams app/i.test(msg) ||
    (!hasCatalogAppId && /custom text/i.test(msg));

  if (needsInstall) {
    const clientHint = azureClientId
      ? ` Client ID do Azure: ${azureClientId}.`
      : "";
    const installSteps = installAttempted
      ? " A instalação automática falhou — no Centro de administração do Teams abra Credenciamento e clique em Install for everyone, ou peça ao destinatário: Teams → Apps → Credenciamento → Adicionar."
      : " Instale o app: admin.teams.microsoft.com → Teams apps → Credenciamento → Install for everyone (ou escopo pessoal do destinatário em Teams → Apps).";
    return `${clientHint}${installSteps} Veja teams-app/README.md.`;
  }

  if (/TeamsActivity|permission|Forbidden/i.test(msg)) {
    return " Adicione a permissão de APLICAÇÃO TeamsActivity.Send + User.Read.All no Azure e conceda admin consent.";
  }

  if (!hasCatalogAppId) {
    return " Configure TEAMS_APP_ID após publicar o app Teams no tenant (teams-app/README.md).";
  }

  return "";
}

/**
 * Notificação no feed de atividades do Teams (sino) — permissão de APLICAÇÃO TeamsActivity.Send.
 * Requer app Teams (manifest + webApplicationInfo) instalado para o usuário destinatário.
 */
async function sendUserActivityNotification(
  accessToken,
  email,
  content,
  webUrl,
  options = {},
) {
  const resolved = await resolveUserByEmail(accessToken, email);
  if (!resolved.ok) return resolved;

  const safeWebUrl = buildTeamsActivityWebUrl(webUrl, {
    manifestAppId: options.teamsAppExternalId,
  });
  const catalogAppId = await resolveTeamsCatalogAppId(accessToken, {
    teamsAppId: options.teamsAppId,
    externalId: options.teamsAppExternalId,
  });

  if (catalogAppId) {
    const catalogStatus = await getTeamsCatalogAppStatus(accessToken, catalogAppId);
    if (catalogStatus.ok && !catalogStatus.hasSendUserRsc) {
      return {
        ok: false,
        message:
          `Catálogo do tenant: versão ${catalogStatus.version} publicada sem RSC TeamsActivity.Send.User. ` +
          "Faça upload de credenciamento-teams.zip (1.1.0+) em admin.teams.microsoft.com → Credenciamento → Upload file, " +
          "remova a instalação do destinatário e instale de novo (aba Permissions deve mostrar TeamsActivity.Send.User).",
      };
    }
  }

  const url = `https://graph.microsoft.com/v1.0/users/${resolved.user.id}/teamwork/sendActivityNotification`;
  const body = buildActivityNotificationBody(content, safeWebUrl, catalogAppId, {
    activityActor: options.activityActor,
    activityMessage: options.activityMessage,
  });

  const postNotification = () =>
    axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    });

  let installAttempted = false;
  let response = await postNotification();

  const needsInstallRetry = (res) => {
    const m = graphErrorMessage(res);
    return /not authorized|not installed|expected Teams app/i.test(m);
  };

  if (
    catalogAppId &&
    (response.status < 200 || response.status >= 300) &&
    needsInstallRetry(response)
  ) {
    const installed = await installTeamsAppForUser(
      accessToken,
      resolved.user.id,
      catalogAppId,
    );
    installAttempted = true;
    if (installed.ok) {
      await new Promise((r) => setTimeout(r, 2000));
      response = await postNotification();
    }
  }

  if (response.status >= 200 && response.status < 300) {
    return {
      ok: true,
      user: resolved.user,
      message: `Notificação enviada para ${resolved.user.displayName || email} no feed do Teams (ícone de sino).`,
    };
  }

  const msg = graphErrorMessage(response);
  const hint = teamsActivityErrorHint(msg, {
    azureClientId: options.azureClientId,
    hasCatalogAppId: !!catalogAppId,
    installAttempted,
  });

  return { ok: false, message: `Feed de atividades: ${msg}.${hint}` };
}

async function sendUserChatMessage(accessToken, email, content) {
  const resolved = await resolveUserByEmail(accessToken, email);
  if (!resolved.ok) return resolved;

  const chat = await getOrCreateOneOnOneChat(accessToken, resolved.user.id);
  if (!chat.ok) {
    const hint = /Missing role permissions/i.test(chat.message || "")
      ? " No Azure, adicione Chat.Create e ChatMessage.Send como permissões de APLICAÇÃO (não Delegadas) e conceda admin consent."
      : " Permissões de aplicação necessárias: Chat.Create e ChatMessage.Send.";
    return {
      ok: false,
      message: `Não foi possível abrir chat 1:1: ${chat.message}.${hint}`,
    };
  }

  const sent = await postChatMessage(accessToken, chat.chatId, content);
  if (!sent.ok) {
    return {
      ok: false,
      message: `Falha ao enviar mensagem: ${sent.message}. Verifique ChatMessage.Send e admin consent.`,
    };
  }

  return {
    ok: true,
    user: resolved.user,
    chatId: chat.chatId,
    message: `Notificação enviada para ${resolved.user.displayName || email} no Teams.`,
  };
}

async function fetchUserPhotoBuffer(tenantId, clientId, clientSecret, microsoftUserId) {
  const token = await getApplicationToken(tenantId, clientId, clientSecret);
  if (!token) return null;

  const urls = [
    `https://graph.microsoft.com/v1.0/users/${microsoftUserId}/photos/48x48/$value`,
    `https://graph.microsoft.com/v1.0/users/${microsoftUserId}/photo/$value`,
  ];

  for (const url of urls) {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
      validateStatus: () => true,
    });

    if (response.status === 200 && response.data?.byteLength > 0) {
      return {
        buffer: Buffer.from(response.data),
        contentType: response.headers["content-type"] || "image/jpeg",
      };
    }
  }

  return null;
}

async function postChannelMessage(accessToken, teamId, channelId, content) {
  const url = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`;
  const response = await axios.post(
    url,
    { body: { content } },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    },
  );

  if (response.status >= 200 && response.status < 300) {
    return { ok: true, data: response.data };
  }

  return { ok: false, message: graphErrorMessage(response), status: response.status };
}

module.exports = {
  getApplicationToken,
  fetchUserPhotoBuffer,
  fetchUserProfileById,
  listDirectoryUsersPage,
  postChannelMessage,
  resolveUserByEmail,
  normalizeHttpsAppUrl,
  normalizeTeamsWebUrl,
  buildTeamsActivityWebUrl,
  resolveTeamsCatalogAppId,
  getTeamsCatalogAppStatus,
  installTeamsAppForUser,
  sendUserActivityNotification,
  sendUserChatMessage,
  sendUserAdaptiveCard,
  postChatAdaptiveCard,
};
