"use strict";

const ACCESS_LIMIT_MAX = 30;
const BASELINE_WINDOW_MS = 10 * 60 * 1000;
const SYNTHETIC_EVENT_BASE = 1_000_000_000_000;
const SYNTHETIC_DEVICE_STRIDE = 10_000_000_000;

function buildAccessQuery({ afterRecNo = null, since = null, limit = ACCESS_LIMIT_MAX } = {}) {
  const count = Math.min(ACCESS_LIMIT_MAX, Math.max(1, Number(limit) || ACCESS_LIMIT_MAX));
  let path =
    `/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec&count=${count}`;
  if (since != null && Number.isFinite(Number(since))) {
    path += `&condition.StartTime=${Math.floor(Number(since))}`;
  }
  if (afterRecNo != null && Number.isFinite(Number(afterRecNo))) {
    path += `&condition.RecNo[0]=%3E&condition.RecNo[1]=${Math.floor(Number(afterRecNo))}`;
  }
  return path;
}

function syntheticEventId(deviceRowId, recNo) {
  const device = Math.max(0, Math.floor(Number(deviceRowId) || 0));
  const rec = Math.max(0, Math.floor(Number(recNo) || 0));
  return SYNTHETIC_EVENT_BASE + device * SYNTHETIC_DEVICE_STRIDE + rec;
}

function responseText(data) {
  if (data == null) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function eventTimeFromRaw(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" || /^\d+$/.test(String(value).trim())) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = n > 1e12 ? n : n * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const recNo = Number(raw.RecNo ?? raw.recNo ?? raw.rec_no);
  if (!Number.isFinite(recNo)) return null;
  const userId = raw.UserID ?? raw.userId ?? raw.user_id ?? raw.CardNo ?? raw.cardNo;
  if (userId == null || String(userId).trim() === "") return null;
  const errorCode = Number(raw.ErrorCode ?? raw.errorCode ?? 0);
  const statusRaw = raw.Status ?? raw.status;
  const statusNum = statusRaw == null || statusRaw === "" ? 1 : Number(statusRaw);
  const blocked = (Number.isFinite(errorCode) && errorCode !== 0) || statusNum === 0;
  return {
    recNo,
    userId: String(userId).trim(),
    eventTime: eventTimeFromRaw(raw.CreateTime ?? raw.createTime ?? raw.Time ?? raw.eventTime),
    blocked,
    method: raw.Method != null ? String(raw.Method) : null,
    status: statusRaw != null ? String(statusRaw) : null,
  };
}

function parseKeyValueRecords(text) {
  const buckets = new Map();
  const lineRe = /^records\[(\d+)\]\.([A-Za-z0-9_]+)=(.*)$/;
  for (const line of String(text).split(/\r?\n/)) {
    const match = lineRe.exec(line.trim());
    if (!match) continue;
    const index = Number(match[1]);
    const bucket = buckets.get(index) || {};
    bucket[match[2]] = match[3];
    buckets.set(index, bucket);
  }
  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .map((index) => mapRecord(buckets.get(index)))
    .filter(Boolean);
}

function parseAccessRecords(data) {
  if (data && typeof data === "object") {
    const list = data.records || data.Records || data.record;
    if (Array.isArray(list)) {
      return list.map(mapRecord).filter(Boolean);
    }
  }
  return parseKeyValueRecords(responseText(data));
}

/**
 * Cursor nulo ancora no maior RecNo recente e não grava esse lote.
 * Falha de leitura não chega aqui: o chamador não avança o cursor.
 */
function selectNewRecords(previous, records, now = new Date()) {
  const valid = (Array.isArray(records) ? records : []).filter(
    (row) => row && Number.isFinite(row.recNo),
  );
  if (previous == null) {
    const cutoff = now.getTime() - BASELINE_WINDOW_MS;
    const recent = valid.filter((row) => {
      if (!row.eventTime) return false;
      const time = new Date(row.eventTime).getTime();
      return Number.isFinite(time) && time >= cutoff;
    });
    if (!recent.length) {
      return { cursor: null, advance: false, fresh: [], baseline: false };
    }
    const cursor = recent.reduce((max, row) => Math.max(max, row.recNo), 0);
    return { cursor, advance: true, fresh: [], baseline: true };
  }
  const after = Number(previous);
  const fresh = valid
    .filter((row) => row.recNo > after)
    .sort((a, b) => a.recNo - b.recNo);
  if (!fresh.length) {
    return { cursor: after, advance: false, fresh: [], baseline: false };
  }
  const cursor = fresh.reduce((max, row) => Math.max(max, row.recNo), after);
  return { cursor, advance: true, fresh, baseline: false };
}

const METHOD_LABELS = {
  0: "Senha",
  1: "Cartão",
  4: "Remoto",
  5: "Botão",
  6: "Digital",
  15: "Face",
};

const STATUS_LABELS = {
  0: "Negado",
  1: "Liberado",
};

function labelFromCode(map, value) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (/^\d+$/.test(text) && map[Number(text)]) return map[Number(text)];
  return text;
}

function accessMethodLabel(method) {
  return labelFromCode(METHOD_LABELS, method);
}

function accessStatusLabel(status, blocked) {
  const label = labelFromCode(STATUS_LABELS, status);
  if (label) return label;
  return blocked ? "Negado" : null;
}

module.exports = {
  ACCESS_LIMIT_MAX,
  BASELINE_WINDOW_MS,
  accessMethodLabel,
  accessStatusLabel,
  buildAccessQuery,
  syntheticEventId,
  parseAccessRecords,
  selectNewRecords,
};
