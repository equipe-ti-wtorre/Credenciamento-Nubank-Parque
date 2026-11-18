const AppError = require("../../utils/AppError");
const { encrypt, decrypt } = require("../../config/cryptoSecrets");
const repo = require("./whatsapp-provider-config.repository");

const VALID_PROVIDERS = ["openwa"];

function normalizeBaseUrl(value) {
  if (!value) return null;
  return String(value).trim().replace(/\/+$/, "");
}

function mapPublic(row) {
  if (!row) {
    return {
      provider: "openwa",
      base_url: null,
      has_api_key: false,
      session_id: null,
      default_country_code: "55",
      ativo: false,
    };
  }
  return {
    provider: row.provider || "openwa",
    base_url: row.base_url || null,
    has_api_key: !!row.api_key_ciphertext,
    session_id: row.session_id || null,
    default_country_code: row.default_country_code || "55",
    ativo: !!row.ativo,
    atualizado_em: row.atualizado_em,
  };
}

async function getPublicConfig() {
  const row = await repo.ensureRow();
  return mapPublic(row);
}

/**
 * Config completa para uso interno (inclui API key decifrada).
 * Retorna mesmo com ativo=0 — quem envia decide via assertCanSend.
 */
async function getConfigForSend() {
  const row = await repo.ensureRow();
  if (!row) return null;

  let apiKey = null;
  if (row.api_key_ciphertext) {
    try {
      apiKey = decrypt(row.api_key_ciphertext);
    } catch {
      apiKey = null;
    }
  }

  return {
    provider: row.provider || "openwa",
    base_url: normalizeBaseUrl(row.base_url),
    api_key: apiKey,
    session_id: row.session_id || null,
    default_country_code: row.default_country_code || "55",
    ativo: !!row.ativo,
  };
}

/**
 * Persiste configuração. API key é write-only: omitida ou vazia mantém a atual.
 */
async function saveProviderConfig(data) {
  const fields = {};

  if (data.provider !== undefined) {
    if (!VALID_PROVIDERS.includes(data.provider)) {
      throw new AppError("Provedor de WhatsApp inválido.", 400);
    }
    fields.provider = data.provider;
  }

  if (data.base_url !== undefined) {
    fields.base_url = normalizeBaseUrl(data.base_url);
  }

  if (data.session_id !== undefined) {
    fields.session_id = data.session_id ? String(data.session_id).trim() : null;
  }

  if (data.default_country_code !== undefined) {
    const digits = String(data.default_country_code || "").replace(/\D/g, "");
    fields.default_country_code = digits || "55";
  }

  if (data.ativo !== undefined) {
    fields.ativo = !!data.ativo;
  }

  if (
    data.api_key !== undefined &&
    data.api_key !== null &&
    String(data.api_key).trim() !== ""
  ) {
    fields.api_key_ciphertext = encrypt(String(data.api_key).trim());
  }

  const row = await repo.update(fields);
  return mapPublic(row);
}

/**
 * Garante que a configuração está completa (não exige ativo).
 * Usado pelas ações administrativas (status, QR, iniciar sessão).
 * @throws {AppError}
 */
async function assertConfigured() {
  const config = await getConfigForSend();
  if (!config) {
    throw new AppError("Gateway WhatsApp não configurado.", 400);
  }
  const missing = [];
  if (!config.base_url) missing.push("URL do OpenWA");
  if (!config.api_key) missing.push("API key");
  if (!config.session_id) missing.push("nome da sessão");
  if (missing.length) {
    throw new AppError(
      `Configuração do WhatsApp incompleta (${missing.join(", ")}).`,
      400,
    );
  }
  return config;
}

/**
 * Garante que o canal pode enviar: configurado e ativo.
 * @throws {AppError}
 */
async function assertCanSend() {
  const config = await assertConfigured();
  if (!config.ativo) {
    throw new AppError("Envio por WhatsApp está desativado.", 400);
  }
  return config;
}

/**
 * true quando o canal está configurado e ativo (sem lançar).
 * Útil para os eventos decidirem se tentam WhatsApp.
 */
async function isEnabled() {
  try {
    await assertCanSend();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getPublicConfig,
  getConfigForSend,
  saveProviderConfig,
  assertConfigured,
  assertCanSend,
  isEnabled,
  mapPublic,
  VALID_PROVIDERS,
};
