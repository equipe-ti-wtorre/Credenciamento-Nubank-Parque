const AppError = require("../../utils/AppError");

const DEFAULT_TIMEOUT_MS = 15000;
const START_TIMEOUT_MS = 60000;

/**
 * Cliente HTTP mínimo para a REST API do OpenWA (X-API-Key).
 * Paths conforme openapi.json do projeto (v0.25):
 *  - GET  /api/health
 *  - POST /api/sessions                      { name }
 *  - GET  /api/sessions/{id}
 *  - POST /api/sessions/{id}/start
 *  - POST /api/sessions/{id}/stop
 *  - GET  /api/sessions/{id}/qr              → { qrCode: dataUrl, status }
 *  - POST /api/sessions/{id}/messages/send-text { chatId, text }
 */
class OpenWaClient {
  /**
   * @param {{ baseUrl: string, apiKey: string, timeoutMs?: number }} opts
   */
  constructor({ baseUrl, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    if (!baseUrl) throw new AppError("URL do OpenWA não informada.", 400);
    if (!apiKey) throw new AppError("API key do OpenWA não informada.", 400);
    this.baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async request(method, path, { body, timeoutMs } = {}) {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || this.timeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          "X-API-Key": this.apiKey,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err?.name === "AbortError") {
        throw new AppError(
          `OpenWA não respondeu em ${Math.round((timeoutMs || this.timeoutMs) / 1000)}s (${method} ${path}).`,
          504,
        );
      }
      const cause =
        err?.cause?.code || err?.cause?.message || err?.code || err?.message || "erro de rede";
      throw new AppError(
        `Não foi possível conectar ao OpenWA em ${this.baseUrl} (${cause}).`,
        502,
      );
    }
    clearTimeout(timer);

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!response.ok) {
      const msg = Array.isArray(data?.message)
        ? data.message.join("; ")
        : data?.message || data?.error || response.statusText || "erro";
      const err = new AppError(`OpenWA (${response.status}): ${msg}`, mapStatus(response.status));
      err.openwaStatus = response.status;
      err.openwaCode = data?.code || null;
      throw err;
    }

    return data;
  }

  health() {
    return this.request("GET", "/api/health");
  }

  listSessions({ name } = {}) {
    const qs = name ? `?name=${encodeURIComponent(name)}` : "";
    return this.request("GET", `/api/sessions${qs}`);
  }

  /**
   * Resolve a sessão pelo nome (o path da API usa o UUID, não o nome).
   * @returns {Promise<object|null>} SessionResponseDto ou null
   */
  async findSessionByName(name) {
    const list = await this.listSessions({ name });
    if (!Array.isArray(list)) return null;
    return list.find((s) => s?.name === name) || null;
  }

  createSession(name) {
    return this.request("POST", "/api/sessions", { body: { name } });
  }

  getSession(sessionId) {
    return this.request("GET", `/api/sessions/${encodeURIComponent(sessionId)}`);
  }

  startSession(sessionId) {
    return this.request(
      "POST",
      `/api/sessions/${encodeURIComponent(sessionId)}/start`,
      { timeoutMs: START_TIMEOUT_MS },
    );
  }

  stopSession(sessionId) {
    return this.request("POST", `/api/sessions/${encodeURIComponent(sessionId)}/stop`);
  }

  getQr(sessionId) {
    return this.request("GET", `/api/sessions/${encodeURIComponent(sessionId)}/qr`);
  }

  sendText(sessionId, chatId, text) {
    return this.request(
      "POST",
      `/api/sessions/${encodeURIComponent(sessionId)}/messages/send-text`,
      { body: { chatId, text } },
    );
  }
}

/** Mapeia status do OpenWA para o status que devolvemos ao painel. */
function mapStatus(status) {
  if (status === 401 || status === 403) return 502; // credencial do gateway — não do usuário
  if (status === 404) return 404;
  if (status === 400 || status === 422) return 400;
  if (status === 409) return 409;
  if (status === 503 || status === 504) return 503;
  return 502;
}

module.exports = { OpenWaClient };
