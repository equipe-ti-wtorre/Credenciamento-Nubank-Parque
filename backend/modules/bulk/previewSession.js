const { randomUUID } = require("crypto");
const AppError = require("../../utils/AppError");

const TTL_MS = 30 * 60 * 1000;
const sessions = new Map();

function pruneExpired() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}

/**
 * @param {object} payload
 * @returns {string} previewId
 */
function savePreviewSession(payload) {
  pruneExpired();
  const previewId = randomUUID();
  sessions.set(previewId, {
    ...payload,
    expiresAt: Date.now() + TTL_MS,
  });
  return previewId;
}

/**
 * @param {string} previewId
 * @param {string} [expectedKind]
 */
function getPreviewSession(previewId, expectedKind, { consumedCode = null } = {}) {
  pruneExpired();
  const session = sessions.get(previewId);
  if (!session) {
    if (consumedCode) {
      throw new AppError(
        "Pré-visualização expirada ou já utilizada.",
        409,
        true,
        null,
        consumedCode,
      );
    }
    throw new AppError("Pré-visualização expirada ou inválida. Envie o arquivo novamente.", 400);
  }
  if (expectedKind && session.kind !== expectedKind) {
    throw new AppError("Pré-visualização incompatível com este endpoint.", 400);
  }
  return session;
}

function deletePreviewSession(previewId) {
  sessions.delete(previewId);
}

module.exports = {
  savePreviewSession,
  getPreviewSession,
  deletePreviewSession,
  TTL_MS,
};
