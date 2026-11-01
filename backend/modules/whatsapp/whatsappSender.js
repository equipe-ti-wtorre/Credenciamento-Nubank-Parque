const db = require("../../config/db");
const { child } = require("../../config/logger");
const AppError = require("../../utils/AppError");
const configService = require("./whatsapp-config.service");
const { OpenWaClient } = require("./openwa.client");
const { toChatId } = require("./phone");

const logger = child({ module: "whatsappSender" });

const MAX_TEXT_LENGTH = 4096;

async function insertSendLog({
  destinatario,
  chatId,
  corpoResumo,
  status,
  erroMensagem,
  usuarioId,
  requestId,
  messageId,
  provider,
}) {
  await db.execute(
    `INSERT INTO whatsapp_send_logs
      (destinatario, chat_id, corpo_resumo, status, erro_mensagem, usuario_id, request_id, message_id, provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(destinatario || "").slice(0, 64),
      chatId ? String(chatId).slice(0, 64) : null,
      corpoResumo ? String(corpoResumo).slice(0, 500) : null,
      status,
      erroMensagem || null,
      usuarioId || null,
      requestId || null,
      messageId ? String(messageId).slice(0, 128) : null,
      provider || null,
    ],
  );
}

function buildClient(config) {
  return new OpenWaClient({ baseUrl: config.base_url, apiKey: config.api_key });
}

// Cache nome da sessão → UUID (o path da API usa o UUID). Invalidado em 404.
const SESSION_ID_TTL_MS = 10 * 60 * 1000;
const sessionIdCache = new Map(); // key: `${base_url}|${name}` → { id, expiresAt }

function cacheKey(config) {
  return `${config.base_url}|${config.session_id}`;
}

function invalidateSessionCache(config) {
  if (config) sessionIdCache.delete(cacheKey(config));
  else sessionIdCache.clear();
}

/**
 * Resolve o UUID da sessão configurada (por nome), com cache.
 * @throws {AppError} 404 se a sessão não existir no OpenWA
 */
async function resolveSessionUuid(client, config) {
  const key = cacheKey(config);
  const cached = sessionIdCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.id;

  const session = await client.findSessionByName(config.session_id);
  if (!session?.id) {
    sessionIdCache.delete(key);
    throw new AppError(
      `Sessão "${config.session_id}" não existe no OpenWA. Inicie a sessão em Configurações → WhatsApp.`,
      404,
    );
  }
  sessionIdCache.set(key, { id: session.id, expiresAt: Date.now() + SESSION_ID_TTL_MS });
  return session.id;
}

/**
 * Envia texto por WhatsApp via OpenWA. Ponto de entrada para os eventos do sistema
 * (equivalente a smtpService.sendMail).
 *
 * @param {object} opts
 * @param {string} opts.to — telefone livre ("(11) 98888-0001") ou chatId ("5511...@c.us")
 * @param {string} opts.text — até 4096 caracteres
 * @param {number} [opts.usuarioId]
 * @param {string} [opts.requestId]
 * @returns {Promise<{ provider: string, messageId: string|null, chatId: string, raw: any }>}
 */
async function sendWhatsApp(opts) {
  const config = await configService.assertCanSend();

  const text = String(opts.text || "").trim();
  if (!text) throw new AppError("Mensagem de WhatsApp vazia.", 400);
  if (text.length > MAX_TEXT_LENGTH) {
    throw new AppError(`Mensagem excede ${MAX_TEXT_LENGTH} caracteres.`, 400);
  }

  let chatId = null;
  try {
    chatId = toChatId(opts.to, config.default_country_code);
    const client = buildClient(config);
    const sessionUuid = await resolveSessionUuid(client, config);

    let result;
    try {
      result = await client.sendText(sessionUuid, chatId, text);
    } catch (err) {
      // Sessão recriada no gateway (UUID mudou): limpa cache e tenta uma vez.
      if (err.openwaStatus === 404) {
        invalidateSessionCache(config);
        const freshUuid = await resolveSessionUuid(client, config);
        result = await client.sendText(freshUuid, chatId, text);
      } else {
        throw err;
      }
    }

    await insertSendLog({
      destinatario: opts.to,
      chatId,
      corpoResumo: text,
      status: "sent",
      usuarioId: opts.usuarioId,
      requestId: opts.requestId,
      messageId: result?.messageId || null,
      provider: config.provider,
    });

    return {
      provider: config.provider,
      messageId: result?.messageId || null,
      chatId,
      raw: result,
    };
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error({ err }, "Falha ao enviar WhatsApp");
    }
    try {
      await insertSendLog({
        destinatario: opts.to,
        chatId,
        corpoResumo: text,
        status: "failed",
        erroMensagem: err.message,
        usuarioId: opts.usuarioId,
        requestId: opts.requestId,
        provider: config.provider,
      });
    } catch (logErr) {
      logger.error({ err: logErr }, "Falha ao gravar log de WhatsApp");
    }
    throw err;
  }
}

module.exports = {
  sendWhatsApp,
  insertSendLog,
  buildClient,
  resolveSessionUuid,
  invalidateSessionCache,
  MAX_TEXT_LENGTH,
};
