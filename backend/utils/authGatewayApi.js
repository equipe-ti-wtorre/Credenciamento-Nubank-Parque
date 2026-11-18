/**
 * API do auth-gateway para sistemas (diretório e foto), de servidor para servidor.
 * O gateway é o único com credencial da Microsoft: o Credenciamento não chama o Graph para isso.
 * Chave em AUTH_API_KEY (só no .env do backend). Guia: seção 9 de docs/auth-gateway.md (tvnbp).
 */
const env = require("../config/env");
const { child } = require("../config/logger");

const logger = child({ module: "auth-gateway-api" });
const TIMEOUT_MS = 10_000;
const PAGE_SIZE = 500;

function isConfigured() {
  return !!(env.authApiKey && env.authGateway.url);
}

async function request(path, { binary = false } = {}) {
  const res = await fetch(`${env.authGateway.url}/v1${path}`, {
    headers: { Authorization: `Bearer ${env.authApiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const code = body?.error?.code || `HTTP_${res.status}`;
    const err = new Error(body?.error?.message || `Gateway respondeu ${res.status}.`);
    err.code = code;
    err.status = res.status;
    throw err;
  }
  if (binary) {
    return {
      status: res.status,
      body: {
        buffer: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get("content-type") || "image/jpeg",
      },
    };
  }
  return { status: res.status, body: await res.json() };
}

/** Pessoa do diretório pelo oid; null se não existe ou está fora do que o sistema vê. */
async function getDirectoryUser(oid) {
  const { body } = await request(`/directory/users/${encodeURIComponent(oid)}`);
  return body;
}

/** Foto JPEG da pessoa; null sem foto. */
async function getDirectoryUserPhoto(oid) {
  const { body } = await request(`/directory/users/${encodeURIComponent(oid)}/photo`, {
    binary: true,
  });
  return body;
}

/**
 * Pessoas alteradas desde `changedSince` (ISO; vazio = todas), com as removidas (`deleted: true`).
 * `serverTime` (da 1ª página) é o `changedSince` da próxima rodada.
 */
async function listDirectoryUsers({ changedSince = null } = {}) {
  const users = [];
  let serverTime = null;
  for (let page = 1; ; page += 1) {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (changedSince) qs.set("changedSince", changedSince);
    const { body } = await request(`/directory/users?${qs}`);
    const data = body?.data || [];
    if (page === 1) serverTime = body?.meta?.serverTime || null;
    users.push(...data);
    const total = Number(body?.meta?.total || 0);
    if (!data.length || page * PAGE_SIZE >= total) break;
  }
  logger.debug({ changedSince, total: users.length }, "Diretório lido do gateway");
  return { users, serverTime };
}

module.exports = {
  isConfigured,
  getDirectoryUser,
  getDirectoryUserPhoto,
  listDirectoryUsers,
};
