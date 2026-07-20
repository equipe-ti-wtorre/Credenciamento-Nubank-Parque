const AppError = require("../../utils/AppError");
const { encrypt, decrypt } = require("../../config/cryptoSecrets");
const repo = require("./email-provider-config.repository");

function mapPublic(row) {
  if (!row) {
    return {
      provider: "smtp",
      acs_sender: null,
      has_acs_connection_string: false,
      ocultar_para: false,
      ativo: true,
    };
  }
  return {
    provider: row.provider || "smtp",
    acs_sender: row.acs_sender || null,
    has_acs_connection_string: !!row.acs_connection_string_ciphertext,
    ocultar_para: !!row.ocultar_para,
    ativo: !!row.ativo,
  };
}

async function getPublicConfig() {
  const row = await repo.ensureRow();
  return mapPublic(row);
}

/**
 * Full config for sending (includes decrypted ACS connection string when present).
 */
async function getConfigForSend() {
  const row = await repo.ensureRow();
  if (!row || !row.ativo) {
    return null;
  }

  const base = {
    provider: row.provider || "smtp",
    acs_sender: row.acs_sender || null,
    ocultar_para: !!row.ocultar_para,
    ativo: !!row.ativo,
    acs_connection_string: null,
  };

  if (row.acs_connection_string_ciphertext) {
    try {
      base.acs_connection_string = decrypt(row.acs_connection_string_ciphertext);
    } catch {
      base.acs_connection_string = null;
    }
  }

  return base;
}

/**
 * Persist provider config. ACS connection string is write-only:
 * omit or empty string keeps existing ciphertext.
 */
async function saveProviderConfig(data) {
  const fields = {};

  if (data.provider !== undefined) {
    if (!["smtp", "acs"].includes(data.provider)) {
      throw new AppError("Provedor de e-mail inválido.", 400);
    }
    fields.provider = data.provider;
  }

  if (data.acs_sender !== undefined) {
    fields.acs_sender = data.acs_sender || null;
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

  const row = await repo.update(fields);
  return mapPublic(row);
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

  return config;
}

module.exports = {
  getPublicConfig,
  getConfigForSend,
  saveProviderConfig,
  assertCanSend,
  mapPublic,
};
