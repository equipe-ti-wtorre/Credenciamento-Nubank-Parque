const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const configService = require("./whatsapp-config.service");
const sender = require("./whatsappSender");

const SESSION_NAME_RE = /^[a-zA-Z0-9-]{3,50}$/;

async function getSettings() {
  return configService.getPublicConfig();
}

async function updateSettings(data) {
  if (data.session_id !== undefined && data.session_id !== null && data.session_id !== "") {
    if (!SESSION_NAME_RE.test(String(data.session_id).trim())) {
      throw new AppError(
        "Nome da sessão inválido: use 3 a 50 caracteres, apenas letras, números e hífen.",
        400,
      );
    }
  }

  // Valida completude antes de persistir, para não gravar ativo=1 incompleto.
  const current = await configService.getPublicConfig();
  const ativo = data.ativo !== undefined ? !!data.ativo : current.ativo;
  if (ativo) {
    const baseUrl = data.base_url !== undefined ? data.base_url : current.base_url;
    const sessionId = data.session_id !== undefined ? data.session_id : current.session_id;
    const hasApiKey =
      (data.api_key !== undefined && data.api_key !== null && String(data.api_key).trim() !== "") ||
      current.has_api_key;
    const missing = [];
    if (!baseUrl) missing.push("URL do OpenWA");
    if (!hasApiKey) missing.push("API key");
    if (!sessionId) missing.push("nome da sessão");
    if (missing.length) {
      throw new AppError(
        `Para ativar o envio por WhatsApp informe: ${missing.join(", ")}.`,
        400,
      );
    }
  }

  const after = await configService.saveProviderConfig(data);
  sender.invalidateSessionCache();
  return after;
}

function mapSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    phone: session.phone || null,
    pushName: session.pushName || null,
    connectedAt: session.connectedAt || null,
    lastActive: session.lastActive || null,
    lastError: session.lastError || null,
    createdAt: session.createdAt || null,
  };
}

/**
 * Estado do gateway + da sessão configurada.
 * Nunca lança por indisponibilidade do gateway: devolve gateway.ok=false.
 */
async function getStatus() {
  const config = await configService.getConfigForSend();
  const base = {
    configured: !!(config?.base_url && config?.api_key && config?.session_id),
    ativo: !!config?.ativo,
    session_name: config?.session_id || null,
    gateway: { ok: false, version: null, message: null },
    session: null,
  };

  if (!base.configured) {
    base.gateway.message = "Configuração incompleta.";
    return base;
  }

  const client = sender.buildClient(config);

  try {
    const health = await client.health();
    base.gateway.ok = health?.status === "ok" || !!health;
    base.gateway.version = health?.version || null;
  } catch (err) {
    base.gateway.message = err.message;
    return base;
  }

  try {
    const session = await client.findSessionByName(config.session_id);
    base.session = mapSession(session);
    if (!session) {
      base.gateway.message = `Sessão "${config.session_id}" ainda não existe no OpenWA. Clique em "Iniciar sessão" para criá-la.`;
    }
  } catch (err) {
    base.gateway.message = err.message;
  }

  return base;
}

/**
 * Cria (se preciso) e inicia a sessão configurada. Retorna o estado após o start.
 */
async function startSession() {
  const config = await configService.assertConfigured();
  const client = sender.buildClient(config);

  let session = await client.findSessionByName(config.session_id);
  if (!session) {
    session = await client.createSession(config.session_id);
    sender.invalidateSessionCache(config);
  }

  const alreadyRunning = ["qr_ready", "authenticating", "ready", "initializing"].includes(
    session?.status,
  );
  if (!alreadyRunning) {
    try {
      session = await client.startSession(session.id);
    } catch (err) {
      // 409 = já em andamento; segue para leitura do estado atual.
      if (err.openwaStatus !== 409) throw err;
    }
  }

  const fresh = await client.getSession(session.id);
  return mapSession(fresh || session);
}

async function stopSession() {
  const config = await configService.assertConfigured();
  const client = sender.buildClient(config);
  const session = await client.findSessionByName(config.session_id);
  if (!session) {
    throw new AppError(`Sessão "${config.session_id}" não existe no OpenWA.`, 404);
  }
  await client.stopSession(session.id);
  const fresh = await client.getSession(session.id);
  return mapSession(fresh || session);
}

/**
 * QR code (data URL) para parear. Só disponível com status qr_ready.
 */
async function getQr() {
  const config = await configService.assertConfigured();
  const client = sender.buildClient(config);
  const session = await client.findSessionByName(config.session_id);
  if (!session) {
    throw new AppError(
      `Sessão "${config.session_id}" não existe. Clique em "Iniciar sessão".`,
      404,
    );
  }
  if (session.status === "ready") {
    return { status: session.status, qrCode: null, session: mapSession(session) };
  }
  try {
    const qr = await client.getQr(session.id);
    return {
      status: qr?.status || session.status,
      qrCode: qr?.qrCode || null,
      session: mapSession(session),
    };
  } catch (err) {
    // QR ainda não gerado (initializing) → devolve estado sem QR em vez de erro.
    if (err.openwaStatus === 404 || err.openwaStatus === 400 || err.openwaStatus === 409) {
      return { status: session.status, qrCode: null, session: mapSession(session) };
    }
    throw err;
  }
}

async function sendTest({ destinatario, mensagem, usuarioId, requestId }) {
  return sender.sendWhatsApp({ to: destinatario, text: mensagem, usuarioId, requestId });
}

async function listLogs({ page = 1, limit = 20, q, status } = {}) {
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];

  const search = typeof q === "string" ? q.trim() : "";
  if (search) {
    const like = `%${search}%`;
    where.push(
      `(destinatario LIKE ? OR IFNULL(chat_id, '') LIKE ? OR IFNULL(corpo_resumo, '') LIKE ?
        OR IFNULL(message_id, '') LIKE ? OR IFNULL(erro_mensagem, '') LIKE ?)`,
    );
    params.push(like, like, like, like, like);
  }

  const validStatuses = ["sent", "failed"];
  if (status && validStatuses.includes(String(status))) {
    where.push("status = ?");
    params.push(String(status));
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await db.execute(
    `SELECT id, destinatario, chat_id, corpo_resumo, status, erro_mensagem, usuario_id, request_id,
            message_id, provider, criado_em
     FROM whatsapp_send_logs
     ${whereSql}
     ORDER BY criado_em DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) AS total FROM whatsapp_send_logs ${whereSql}`,
    params,
  );
  return {
    logs: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

module.exports = {
  getSettings,
  updateSettings,
  getStatus,
  startSession,
  stopSession,
  getQr,
  sendTest,
  listLogs,
  sendWhatsApp: sender.sendWhatsApp,
};
