"use strict";

const crypto = require("crypto");
const axios = require("axios");
const https = require("https");
const env = require("../../config/env");
const { child } = require("../../config/logger");
const {
  buildAccessUserRecord,
  buildInsertUserBody,
  buildInsertFaceBody,
  buildRemoveUserBody,
  interpretCgiResponse,
} = require("./dahua.payload");
const { buildAccessQuery } = require("./dahua.access");

const logger = child({ module: "dahua-client" });

const TEST_TIMEOUT_MS = 8000;
const ENROLL_TIMEOUT_MS = 20000;

function md5(value) {
  return crypto.createHash("md5").update(value).digest("hex");
}

function parseDigestChallenge(header) {
  const out = {};
  const source = String(header || "").replace(/^Digest\s+/i, "");
  const re = /(\w+)=("([^"]*)"|([^,]*))/g;
  let match;
  while ((match = re.exec(source))) {
    out[match[1]] = match[3] != null ? match[3] : String(match[4] || "").trim();
  }
  return out;
}

function buildDigestAuthorization({ username, password, method, uri, challenge }) {
  const realm = challenge.realm || "";
  const nonce = challenge.nonce || "";
  const qopRaw = challenge.qop || "";
  const qop = qopRaw.split(",")[0].trim();
  const nc = "00000001";
  const cnonce = crypto.randomBytes(8).toString("hex");
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);
  let header = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop) header += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (challenge.opaque) header += `, opaque="${challenge.opaque}"`;
  if (challenge.algorithm) header += `, algorithm=${challenge.algorithm}`;
  return header;
}

function deviceBaseUrl(device) {
  const port = Number(device.port) || 80;
  const tls = port === 443;
  return {
    baseURL: `${tls ? "https" : "http"}://${device.host}:${port}`,
    httpsAgent: tls ? new https.Agent({ rejectUnauthorized: false }) : undefined,
  };
}

async function requestCgi(device, { method, path, data, timeoutMs }) {
  const { baseURL, httpsAgent } = deviceBaseUrl(device);
  const headers = data != null ? { "Content-Type": "application/json" } : {};
  const common = {
    method,
    baseURL,
    url: path,
    data,
    timeout: timeoutMs,
    validateStatus: () => true,
    httpsAgent,
    headers,
  };

  let first;
  try {
    first = await axios.request(common);
  } catch (err) {
    const code = err.code ? ` (${err.code})` : "";
    throw new Error(`Sem acesso ao terminal ${device.host}${code}`);
  }

  if (first.status !== 401) {
    return first;
  }

  const www = first.headers?.["www-authenticate"] || "";
  if (!/digest/i.test(www)) {
    const token = Buffer.from(`${device.username}:${device.password}`).toString("base64");
    return axios.request({
      ...common,
      headers: { ...headers, Authorization: `Basic ${token}` },
    });
  }

  const authorization = buildDigestAuthorization({
    username: device.username,
    password: device.password,
    method: String(method || "GET").toUpperCase(),
    uri: path,
    challenge: parseDigestChallenge(www),
  });
  return axios.request({
    ...common,
    headers: { ...headers, Authorization: authorization },
  });
}

async function postCgi(device, path, body, timeoutMs) {
  const res = await requestCgi(device, {
    method: "POST",
    path,
    data: body,
    timeoutMs,
  });
  return interpretCgiResponse(res.status, res.data);
}

async function ensurePhotoBase64(photoBase64) {
  const buf = Buffer.from(String(photoBase64 || ""), "base64");
  if (!buf.length) {
    throw new Error("Foto ausente para o terminal Dahua");
  }
  const maxBytes = env.faces.dahua.maxBytes;
  if (buf.length <= maxBytes) return photoBase64;
  const { analyzeImage, tryJpegUnderBudget } = require("../faces/facial.image");
  const info = await analyzeImage(buf);
  if (!info.width || !info.height) {
    throw new Error("Foto acima do limite Dahua e sem dimensões para comprimir");
  }
  const compressed = await tryJpegUnderBudget(buf, {
    width: info.width,
    height: info.height,
    maxBytes,
  });
  if (!compressed.viable || !compressed.buffer) {
    throw new Error(`Foto acima do limite Dahua (${maxBytes} bytes)`);
  }
  return compressed.buffer.toString("base64");
}

async function enrollOnDevice(device, { userId, userName, photoBase64, validFrom, validTo }) {
  const record = buildAccessUserRecord({ userId, userName, validFrom, validTo });
  const inserted = await postCgi(
    device,
    "/cgi-bin/AccessUser.cgi?action=insertMulti",
    buildInsertUserBody(record),
    ENROLL_TIMEOUT_MS,
  );
  if (!inserted.ok) {
    const updated = await postCgi(
      device,
      "/cgi-bin/AccessUser.cgi?action=updateMulti",
      buildInsertUserBody(record),
      ENROLL_TIMEOUT_MS,
    );
    if (!updated.ok) {
      throw new Error(updated.error || inserted.error || "Falha ao gravar usuário no terminal");
    }
  }

  const face = await ensurePhotoBase64(photoBase64);
  const faceBody = buildInsertFaceBody({ userId, photoBase64: face });
  const faceInserted = await postCgi(
    device,
    "/cgi-bin/AccessFace.cgi?action=insertMulti",
    faceBody,
    ENROLL_TIMEOUT_MS,
  );
  if (faceInserted.ok) return { ok: true };
  const faceUpdated = await postCgi(
    device,
    "/cgi-bin/AccessFace.cgi?action=updateMulti",
    faceBody,
    ENROLL_TIMEOUT_MS,
  );
  if (!faceUpdated.ok) {
    throw new Error(faceUpdated.error || faceInserted.error || "Falha ao gravar a face no terminal");
  }
  return { ok: true };
}

async function revokeOnDevice(device, userId) {
  const result = await postCgi(
    device,
    "/cgi-bin/AccessUser.cgi?action=removeMulti",
    buildRemoveUserBody(userId),
    ENROLL_TIMEOUT_MS,
  );
  if (result.ok || result.notFound) return { ok: true };
  throw new Error(result.error || "Falha ao remover usuário do terminal");
}

async function findAccessRecords(device, { afterRecNo = null, since = null, limit = 30, timeoutMs = 5000 } = {}) {
  const path = buildAccessQuery({ afterRecNo, since, limit });
  const res = await requestCgi(device, {
    method: "GET",
    path,
    timeoutMs,
  });
  const interpreted = interpretCgiResponse(res.status, res.data);
  if (!interpreted.ok) {
    throw new Error(interpreted.error || "Falha ao ler passagens do terminal");
  }
  return res.data;
}

async function testConnection(device) {
  const res = await requestCgi(device, {
    method: "GET",
    path: "/cgi-bin/magicBox.cgi?action=getDeviceType",
    timeoutMs: TEST_TIMEOUT_MS,
  });
  const interpreted = interpretCgiResponse(res.status, res.data);
  if (!interpreted.ok) {
    return { ok: false, error: interpreted.error || "Terminal não respondeu" };
  }
  const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data || "");
  const typeMatch = /type=([^\s]+)/i.exec(text);
  return {
    ok: true,
    deviceType: typeMatch ? typeMatch[1] : text.replace(/\s+/g, " ").trim().slice(0, 80),
  };
}

function logDeviceError(err, device, action) {
  logger.warn(
    { err: err.message, deviceKey: device.device_key, host: device.host, action },
    "Falha no terminal Dahua",
  );
}

module.exports = {
  enrollOnDevice,
  revokeOnDevice,
  findAccessRecords,
  testConnection,
  logDeviceError,
  buildDigestAuthorization,
  parseDigestChallenge,
};
