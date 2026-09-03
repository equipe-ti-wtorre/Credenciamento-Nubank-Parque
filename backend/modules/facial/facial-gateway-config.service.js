"use strict";

const db = require("../../config/db");
const env = require("../../config/env");
const { encrypt, decrypt } = require("../../config/cryptoSecrets");
const { parseIpList } = require("../../utils/facialPeerIps");

const SINGLETON_ID = 1;
const CACHE_TTL_MS = 30_000;
const MAX_MESSAGE_BYTES = 250_000;

const DEFAULT_COMMANDS_QUEUE = "facial-commands";
const DEFAULT_STATUS_QUEUE = "facial-enrollment-status";

let runtimeCache = null;
let runtimeCacheAt = 0;

function invalidateRuntimeCache() {
  runtimeCache = null;
  runtimeCacheAt = 0;
  try {
    require("./service-bus.client").resetClients();
  } catch {
    /* service-bus pode não estar carregado ainda */
  }
}

async function getRow() {
  const [rows] = await db.execute(
    "SELECT * FROM facial_gateway_config WHERE id = ? LIMIT 1",
    [SINGLETON_ID],
  );
  return rows[0] || null;
}

async function ensureRow() {
  const existing = await getRow();
  if (existing) return existing;
  await db.execute(
    `INSERT INTO facial_gateway_config (id, enabled) VALUES (?, 0)
     ON DUPLICATE KEY UPDATE id = id`,
    [SINGLETON_ID],
  );
  return getRow();
}

function safeDecrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    return decrypt(ciphertext);
  } catch {
    return null;
  }
}

function resolveTransportFromFlags(hasCommandsCs, hasStatusCs) {
  return hasCommandsCs && hasStatusCs ? "service_bus" : "http_poll";
}

function resolveTransport(runtime) {
  return resolveTransportFromFlags(
    !!runtime?.serviceBus?.commandsConnectionString,
    !!runtime?.serviceBus?.statusConnectionString,
  );
}

function hasEnvEventsSecret() {
  return !!(env.facialGatewayEventsSecret && env.facialGatewayEventsSecret.length >= 32);
}

function peerOriginFrom(row) {
  const fromRow = row?.peer_origin_ip != null ? String(row.peer_origin_ip).trim() : "";
  return fromRow || env.facialPeerOriginIpRaw || "";
}

function peerDestinationFrom(row) {
  const fromRow = row?.peer_destination_ip != null ? String(row.peer_destination_ip).trim() : "";
  return fromRow || env.facialPeerDestinationIpRaw || "";
}

function mapPublicRow(row) {
  if (!row) {
    return {
      enabled: false,
      commands_queue: DEFAULT_COMMANDS_QUEUE,
      status_queue: DEFAULT_STATUS_QUEUE,
      has_events_secret: hasEnvEventsSecret(),
      has_commands_connection_string: false,
      has_status_connection_string: false,
      transport: "http_poll",
      peer_origin_ip: env.facialPeerOriginIpRaw || "",
      peer_destination_ip: env.facialPeerDestinationIpRaw || "",
      atualizado_em: null,
    };
  }
  const hasCommands = !!row.commands_connection_string_ciphertext;
  const hasStatus = !!row.status_connection_string_ciphertext;
  return {
    enabled: !!row.enabled,
    commands_queue: row.commands_queue || DEFAULT_COMMANDS_QUEUE,
    status_queue: row.status_queue || DEFAULT_STATUS_QUEUE,
    has_events_secret: hasEnvEventsSecret(),
    has_commands_connection_string: hasCommands,
    has_status_connection_string: hasStatus,
    transport: resolveTransportFromFlags(hasCommands, hasStatus),
    peer_origin_ip: peerOriginFrom(row),
    peer_destination_ip: peerDestinationFrom(row),
    atualizado_em: row.atualizado_em,
  };
}

async function getPublicConfig() {
  const row = await ensureRow();
  return mapPublicRow(row);
}

async function getRuntimeConfig() {
  if (runtimeCache && Date.now() - runtimeCacheAt < CACHE_TTL_MS) {
    return runtimeCache;
  }

  const row = await ensureRow();
  runtimeCache = {
    enabled: !!row.enabled,
    eventsSecret: env.facialGatewayEventsSecret || null,
    peerOriginIp: peerOriginFrom(row),
    peerDestinationIp: peerDestinationFrom(row),
    serviceBus: {
      commandsConnectionString: safeDecrypt(row.commands_connection_string_ciphertext),
      commandsQueue: row.commands_queue || DEFAULT_COMMANDS_QUEUE,
      statusConnectionString: safeDecrypt(row.status_connection_string_ciphertext),
      statusQueue: row.status_queue || DEFAULT_STATUS_QUEUE,
    },
    maxMessageBytes: MAX_MESSAGE_BYTES,
  };
  runtimeCacheAt = Date.now();
  return runtimeCache;
}

async function updateConfig(data) {
  await ensureRow();
  const current = await getRow();

  const enabled = data.enabled !== undefined ? !!data.enabled : !!current.enabled;
  const commandsQueue =
    data.commands_queue !== undefined
      ? String(data.commands_queue || DEFAULT_COMMANDS_QUEUE).trim()
      : current.commands_queue || DEFAULT_COMMANDS_QUEUE;
  const statusQueue =
    data.status_queue !== undefined
      ? String(data.status_queue || DEFAULT_STATUS_QUEUE).trim()
      : current.status_queue || DEFAULT_STATUS_QUEUE;

  let peerOriginIp =
    current.peer_origin_ip != null ? String(current.peer_origin_ip) : "";
  if (data.peer_origin_ip !== undefined) {
    peerOriginIp = String(data.peer_origin_ip || "").trim();
    parseIpList(peerOriginIp);
  }

  let peerDestinationIp =
    current.peer_destination_ip != null ? String(current.peer_destination_ip) : "";
  if (data.peer_destination_ip !== undefined) {
    peerDestinationIp = String(data.peer_destination_ip || "").trim();
    parseIpList(peerDestinationIp);
  }

  let commandsConnCiphertext = current.commands_connection_string_ciphertext;
  if (data.commands_connection_string !== undefined) {
    commandsConnCiphertext = data.commands_connection_string
      ? encrypt(data.commands_connection_string)
      : null;
  }

  let statusConnCiphertext = current.status_connection_string_ciphertext;
  if (data.status_connection_string !== undefined) {
    statusConnCiphertext = data.status_connection_string
      ? encrypt(data.status_connection_string)
      : null;
  }

  if (enabled && !hasEnvEventsSecret()) {
    throw new Error(
      "FACIAL_GATEWAY_EVENTS_SECRET é obrigatório quando a integração está ativa.",
    );
  }

  await db.execute(
    `UPDATE facial_gateway_config SET
       enabled = ?,
       commands_connection_string_ciphertext = ?,
       commands_queue = ?,
       status_connection_string_ciphertext = ?,
       status_queue = ?,
       peer_origin_ip = ?,
       peer_destination_ip = ?
     WHERE id = ?`,
    [
      enabled ? 1 : 0,
      commandsConnCiphertext,
      commandsQueue || DEFAULT_COMMANDS_QUEUE,
      statusConnCiphertext,
      statusQueue || DEFAULT_STATUS_QUEUE,
      peerOriginIp || null,
      peerDestinationIp || null,
      SINGLETON_ID,
    ],
  );

  invalidateRuntimeCache();
  return getPublicConfig();
}

module.exports = {
  getPublicConfig,
  getRuntimeConfig,
  updateConfig,
  invalidateRuntimeCache,
  resolveTransport,
  resolveTransportFromFlags,
  MAX_MESSAGE_BYTES,
  DEFAULT_COMMANDS_QUEUE,
  DEFAULT_STATUS_QUEUE,
};
