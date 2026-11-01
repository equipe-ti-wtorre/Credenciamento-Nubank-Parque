const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const AppError = require("../../utils/AppError");
const { child } = require("../../config/logger");

const logger = child({ module: "whatsappLimits" });

const OPENWA_ENV_PATH = process.env.OPENWA_ENV_PATH || "/www/wwwroot/openwa/.env";
const OPENWA_PM2_NAME = process.env.OPENWA_PM2_NAME || "openwa";

/** Defaults do próprio OpenWA (v0.25) quando a variável não está no .env. */
const DEFAULTS = {
  SEND_PACING_ENABLED: "false",
  SEND_PACING_WARMUP_SCHEDULE: "20,40,80,160,320,640,1000",
  SEND_PACING_COLD_DAILY_CAP: "5,10,20,40,60,80,100",
  SEND_PACING_BREAKER_THRESHOLD: "5",
  SEND_PACING_BREAKER_COOLDOWN_MS: "900000",
  SIMULATE_TYPING: "true",
  SIMULATE_TYPING_MAX_MS: "5000",
};

const KEYS = Object.keys(DEFAULTS);

function parseEnv(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) values[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

function parseList(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function parseBool(raw) {
  return String(raw).trim().toLowerCase() === "true";
}

function readEnvFile() {
  try {
    return fs.readFileSync(OPENWA_ENV_PATH, "utf8");
  } catch (err) {
    throw new AppError(
      `Não foi possível ler o .env do OpenWA (${OPENWA_ENV_PATH}): ${err.code || err.message}`,
      500,
    );
  }
}

function toPublic(values) {
  const v = { ...DEFAULTS, ...values };
  const coldRaw = String(v.SEND_PACING_COLD_DAILY_CAP).trim().toLowerCase();
  const coldDisabled = coldRaw === "0" || coldRaw === "off";
  return {
    pacing_enabled: parseBool(v.SEND_PACING_ENABLED),
    warmup_schedule: parseList(v.SEND_PACING_WARMUP_SCHEDULE),
    cold_cap_enabled: !coldDisabled,
    cold_daily_cap: coldDisabled ? [] : parseList(v.SEND_PACING_COLD_DAILY_CAP),
    breaker_threshold: Number(v.SEND_PACING_BREAKER_THRESHOLD) || 0,
    breaker_cooldown_minutes: Math.round((Number(v.SEND_PACING_BREAKER_COOLDOWN_MS) || 0) / 60000),
    simulate_typing: parseBool(v.SIMULATE_TYPING),
    simulate_typing_max_ms: Number(v.SIMULATE_TYPING_MAX_MS) || 0,
    env_path: OPENWA_ENV_PATH,
    defaults: {
      warmup_schedule: parseList(DEFAULTS.SEND_PACING_WARMUP_SCHEDULE),
      cold_daily_cap: parseList(DEFAULTS.SEND_PACING_COLD_DAILY_CAP),
      breaker_threshold: Number(DEFAULTS.SEND_PACING_BREAKER_THRESHOLD),
      breaker_cooldown_minutes: Number(DEFAULTS.SEND_PACING_BREAKER_COOLDOWN_MS) / 60000,
      simulate_typing_max_ms: Number(DEFAULTS.SIMULATE_TYPING_MAX_MS),
    },
  };
}

async function getLimits() {
  return toPublic(parseEnv(readEnvFile()));
}

function validateList(list, label) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 30) {
    throw new AppError(`${label}: informe de 1 a 30 valores.`, 400);
  }
  for (const n of list) {
    if (!Number.isInteger(n) || n < 1 || n > 100000) {
      throw new AppError(`${label}: use inteiros entre 1 e 100000.`, 400);
    }
  }
  return list.join(",");
}

/** Converte o payload da tela nas variáveis do .env. */
function toEnvValues(data) {
  const out = {
    SEND_PACING_ENABLED: data.pacing_enabled ? "true" : "false",
    SEND_PACING_WARMUP_SCHEDULE: validateList(data.warmup_schedule, "Limite diário por idade"),
    SEND_PACING_COLD_DAILY_CAP: data.cold_cap_enabled
      ? validateList(data.cold_daily_cap, "Limite de novos contatos")
      : "0",
    SEND_PACING_BREAKER_THRESHOLD: String(data.breaker_threshold),
    SEND_PACING_BREAKER_COOLDOWN_MS: String(Math.round(data.breaker_cooldown_minutes * 60000)),
    SIMULATE_TYPING: data.simulate_typing ? "true" : "false",
    SIMULATE_TYPING_MAX_MS: String(data.simulate_typing_max_ms),
  };
  return out;
}

/** Substitui/insere chaves preservando o resto do arquivo (comentários, ordem). */
function mergeEnv(content, updates) {
  const pending = new Set(Object.keys(updates));
  const lines = content.split(/\r?\n/).map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && pending.has(m[1])) {
      pending.delete(m[1]);
      return `${m[1]}=${updates[m[1]]}`;
    }
    return line;
  });
  if (pending.size) {
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    lines.push("", "# Limites anti-bloqueio (gerenciado pelo Credenciamento → WhatsApp → Limites)");
    for (const key of KEYS) if (pending.has(key)) lines.push(`${key}=${updates[key]}`);
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function restartOpenWa() {
  const pm2Bin = path.join(path.dirname(process.execPath), "pm2");
  // Env mínimo: não repassar as variáveis do backend (PORT, DB_*...) ao OpenWA.
  const env = {
    PATH: `${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
    HOME: process.env.HOME || "/root",
    ...(process.env.PM2_HOME ? { PM2_HOME: process.env.PM2_HOME } : {}),
  };
  return new Promise((resolve) => {
    execFile(pm2Bin, ["restart", OPENWA_PM2_NAME], { env, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        logger.error({ err, stderr }, "Falha ao reiniciar OpenWA via PM2");
        resolve({ ok: false, message: (stderr || err.message || "").trim().slice(0, 300) });
      } else {
        resolve({ ok: true, message: "OpenWA reiniciado." });
      }
    });
  });
}

/**
 * Grava os limites no .env do OpenWA (com backup) e, se pedido, reinicia o processo.
 */
async function saveLimits(data, { restart = true } = {}) {
  const updates = toEnvValues(data);
  const content = readEnvFile();
  const next = mergeEnv(content, updates);

  try {
    fs.copyFileSync(OPENWA_ENV_PATH, `${OPENWA_ENV_PATH}.bak`);
    const tmp = `${OPENWA_ENV_PATH}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, next, { mode: 0o600 });
    fs.renameSync(tmp, OPENWA_ENV_PATH);
  } catch (err) {
    throw new AppError(
      `Não foi possível gravar o .env do OpenWA (${OPENWA_ENV_PATH}): ${err.code || err.message}`,
      500,
    );
  }

  const restartResult = restart ? await restartOpenWa() : { ok: false, message: "Reinício não solicitado." };
  return { limits: toPublic(parseEnv(next)), restart: { requested: restart, ...restartResult }, updates };
}

module.exports = { getLimits, saveLimits, mergeEnv, parseEnv, toEnvValues, DEFAULTS };
