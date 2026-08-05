const AppError = require("../../utils/AppError");
const { encrypt, decrypt } = require("../../config/cryptoSecrets");
const repo = require("./email-provider-config.repository");

const VALID_PROVIDERS = ["smtp", "acs", "sendgrid"];

function mapPublic(row) {
  if (!row) {
    return {
      provider: "smtp",
      acs_sender: null,
      has_acs_connection_string: false,
      sendgrid_from_email: null,
      sendgrid_from_name: null,
      has_sendgrid_api_key: false,
      has_sendgrid_webhook_verification_key: false,
      ocultar_para: false,
      ativo: true,
    };
  }
  return {
    provider: row.provider || "smtp",
    acs_sender: row.acs_sender || null,
    has_acs_connection_string: !!row.acs_connection_string_ciphertext,
    sendgrid_from_email: row.sendgrid_from_email || null,
    sendgrid_from_name: row.sendgrid_from_name || null,
    has_sendgrid_api_key: !!row.sendgrid_api_key_ciphertext,
    has_sendgrid_webhook_verification_key:
      !!row.sendgrid_webhook_verification_key_ciphertext,
    ocultar_para: !!row.ocultar_para,
    ativo: !!row.ativo,
  };
}

async function getPublicConfig() {
  const row = await repo.ensureRow();
  return mapPublic(row);
}

/**
 * Full config for sending (includes decrypted secrets when present).
 */
async function getConfigForSend() {
  const row = await repo.ensureRow();
  if (!row || !row.ativo) {
    return null;
  }

  const base = {
    provider: row.provider || "smtp",
    acs_sender: row.acs_sender || null,
    sendgrid_from_email: row.sendgrid_from_email || null,
    sendgrid_from_name: row.sendgrid_from_name || null,
    ocultar_para: !!row.ocultar_para,
    ativo: !!row.ativo,
    acs_connection_string: null,
    sendgrid_api_key: null,
  };

  if (row.acs_connection_string_ciphertext) {
    try {
      base.acs_connection_string = decrypt(row.acs_connection_string_ciphertext);
    } catch {
      base.acs_connection_string = null;
    }
  }

  if (row.sendgrid_api_key_ciphertext) {
    try {
      base.sendgrid_api_key = decrypt(row.sendgrid_api_key_ciphertext);
    } catch {
      base.sendgrid_api_key = null;
    }
  }

  return base;
}

/**
 * Persist provider config. Secrets are write-only:
 * omit or empty string keeps existing ciphertext.
 */
async function saveProviderConfig(data) {
  const fields = {};

  if (data.provider !== undefined) {
    if (!VALID_PROVIDERS.includes(data.provider)) {
      throw new AppError("Provedor de e-mail inválido.", 400);
    }
    fields.provider = data.provider;
  }

  if (data.acs_sender !== undefined) {
    fields.acs_sender = data.acs_sender || null;
  }

  if (data.sendgrid_from_email !== undefined) {
    fields.sendgrid_from_email = data.sendgrid_from_email || null;
  }

  if (data.sendgrid_from_name !== undefined) {
    fields.sendgrid_from_name = data.sendgrid_from_name || null;
  }

  if (data.ocultar_para !== undefined) {
    fields.ocultar_para = !!data.ocultar_para;
  }

  if (data.ativo !== undefined) {
    fields.ativo = !!data.ativo;
  }

  if (
    data.acs_connection_string !== undefined &&
    data.acs_connection_string !== null &&
    String(data.acs_connection_string).trim() !== ""
  ) {
    fields.acs_connection_string_ciphertext = encrypt(
      String(data.acs_connection_string).trim(),
    );
  }

  if (
    data.sendgrid_api_key !== undefined &&
    data.sendgrid_api_key !== null &&
    String(data.sendgrid_api_key).trim() !== ""
  ) {
    fields.sendgrid_api_key_ciphertext = encrypt(
      String(data.sendgrid_api_key).trim(),
    );
  }

  if (
    data.sendgrid_webhook_verification_key !== undefined &&
    data.sendgrid_webhook_verification_key !== null &&
    String(data.sendgrid_webhook_verification_key).trim() !== ""
  ) {
    fields.sendgrid_webhook_verification_key_ciphertext = encrypt(
      String(data.sendgrid_webhook_verification_key).trim(),
    );
  }

  const row = await repo.update(fields);
  return mapPublic(row);
}

/**
 * Decrypted SendGrid Signed Event Webhook verification key, or null.
 */
async function getSendgridWebhookVerificationKey() {
  const row = await repo.ensureRow();
  if (!row?.sendgrid_webhook_verification_key_ciphertext) return null;
  try {
    return decrypt(row.sendgrid_webhook_verification_key_ciphertext);
  } catch {
    return null;
  }
}

/**
 * Validate that the active provider is ready to send.
 * @throws {AppError}
 */
async function assertCanSend() {
  const config = await getConfigForSend();
  if (!config) {
    throw new AppError("Provedor de e-mail não configurado.", 400);
  }

  if (config.provider === "acs") {
    if (!config.acs_connection_string || !config.acs_sender) {
      throw new AppError(
        "Provedor de e-mail ACS incompleto (connection string e remetente são obrigatórios).",
        400,
      );
    }
  }

  if (config.provider === "sendgrid") {
    if (!config.sendgrid_api_key || !config.sendgrid_from_email) {
      throw new AppError(
        "Provedor de e-mail SendGrid incompleto (API key e remetente são obrigatórios).",
        400,
      );
    }
  }

  return config;
}

module.exports = {
  getPublicConfig,
  getConfigForSend,
  getSendgridWebhookVerificationKey,
  saveProviderConfig,
  assertCanSend,
  mapPublic,
  VALID_PROVIDERS,
};
