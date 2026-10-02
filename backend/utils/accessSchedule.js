"use strict";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Segundos desde meia-noite, ou null se inválido. */
function parseTimeToSeconds(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
  }
  const raw = String(value).trim();
  const iso = raw.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  const m = raw.match(TIME_RE) || iso;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3] || 0);
  if (!Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
  return h * 3600 + min * 60 + sec;
}

function formatHm(value) {
  const sec = parseTimeToSeconds(value);
  if (sec == null) return null;
  const h = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  return `${pad2(h)}:${pad2(min)}`;
}

function toSqlTime(value) {
  const hm = formatHm(value);
  return hm ? `${hm}:00` : null;
}

function crossesMidnight(start, end) {
  const a = parseTimeToSeconds(start);
  const b = parseTimeToSeconds(end);
  if (a == null || b == null) return false;
  return a > b;
}

function toDateKey(value) {
  if (value == null) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(dateKey, delta) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
}

function secondsOfDayFromNow(now) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) {
    return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  }
  const raw = String(now || "").trim();
  const m = raw.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
}

function dateKeyFromNow(now) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return toDateKey(now);
  return toDateKey(now);
}

/**
 * Janela sem horário (legado): só datas.
 * Mesmo dia: [start, end] inclusive.
 * Overnight: noite que começa em accessDay (start_date..end_date), incluindo a madrugada do dia seguinte.
 */
function isCheckInAllowed(now, access) {
  if (!access) return false;
  const startDate = toDateKey(access.start_date);
  const endDate = toDateKey(access.end_date);
  if (!startDate || !endDate) return false;

  const nowDate = dateKeyFromNow(now);
  const nowSec = secondsOfDayFromNow(now);
  if (!nowDate || nowSec == null) return false;

  const winStart = parseTimeToSeconds(access.schedule_start);
  const winEnd = parseTimeToSeconds(access.schedule_end);
  if (winStart == null || winEnd == null) {
    return nowDate >= startDate && nowDate <= endDate;
  }

  const overnight =
    winStart > winEnd || Number(access.schedule_crosses_midnight) === 1;

  if (!overnight) {
    if (nowDate < startDate || nowDate > endDate) return false;
    return nowSec >= winStart && nowSec <= winEnd;
  }

  let accessDay = null;
  if (nowSec >= winStart) accessDay = nowDate;
  else if (nowSec <= winEnd) accessDay = addDays(nowDate, -1);
  else return false;

  return accessDay >= startDate && accessDay <= endDate;
}

function formatScheduleRange(access) {
  const start = formatHm(access?.schedule_start);
  const end = formatHm(access?.schedule_end);
  if (!start || !end) return null;
  const overnight =
    Number(access?.schedule_crosses_midnight) === 1 || start > end;
  return overnight ? `${start}–${end} do dia seguinte` : `${start}–${end}`;
}

function outsideScheduleReason(access) {
  const range = formatScheduleRange(access);
  return range ? `Fora do horário do acesso (${range}).` : "Fora do horário do acesso.";
}

function sqlServiceVisibleToday(alias = "sa") {
  return `(
    CURDATE() BETWEEN ${alias}.start_date AND ${alias}.end_date
    OR (
      ${alias}.schedule_crosses_midnight = 1
      AND ${alias}.schedule_start IS NOT NULL
      AND ${alias}.schedule_end IS NOT NULL
      AND CURDATE() = DATE_ADD(${alias}.end_date, INTERVAL 1 DAY)
      AND CURTIME() <= ${alias}.schedule_end
    )
  )`;
}

const SCHEDULE_SELECT_COLUMNS = `sa.schedule_type,
         sa.schedule_start,
         sa.schedule_end,
         sa.schedule_crosses_midnight`;

module.exports = {
  parseTimeToSeconds,
  formatHm,
  toSqlTime,
  crossesMidnight,
  toDateKey,
  isCheckInAllowed,
  formatScheduleRange,
  outsideScheduleReason,
  sqlServiceVisibleToday,
  SCHEDULE_SELECT_COLUMNS,
};
