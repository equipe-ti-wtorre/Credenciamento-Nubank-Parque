"use strict";

const USER_NAME_MAX = 32;

function buildAccessUserRecord({ userId, userName, validFrom, validTo }) {
  const id = String(userId);
  const name = String(userName || id).trim() || id;
  return {
    UserID: id,
    UserName: name.slice(0, USER_NAME_MAX),
    UserType: 0,
    Authority: 2,
    Password: "",
    Doors: [0],
    TimeSections: [255],
    ValidFrom: validFrom || undefined,
    ValidTo: validTo || undefined,
  };
}

function buildInsertUserBody(record) {
  return { UserList: [record] };
}

function buildInsertFaceBody({ userId, photoBase64 }) {
  return {
    FaceList: [
      {
        UserID: String(userId),
        PhotoData: [photoBase64],
      },
    ],
  };
}

function buildRemoveUserBody(userId) {
  return { UserIDList: [String(userId)] };
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

function interpretCgiResponse(status, data) {
  const text = responseText(data);
  const lower = text.toLowerCase();
  if (status === 401 || status === 403) {
    return { ok: false, error: "Credencial recusada pelo terminal" };
  }
  if (status < 200 || status >= 300) {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 180);
    return { ok: false, error: snippet ? `HTTP ${status}: ${snippet}` : `HTTP ${status}` };
  }
  if (data && typeof data === "object" && Number(data.FailCount) > 0) {
    return { ok: false, error: summarizeFail(data) };
  }
  if (/not\s*exist|not\s*found|no\s*record|user\s*not/i.test(lower)) {
    return { ok: false, notFound: true, error: "Usuário não encontrado no terminal" };
  }
  return { ok: true };
}

/** Valor de query CGI: espaço vira %20 e os dois-pontos da data ficam literais. */
function encodeCgiValue(value) {
  return encodeURIComponent(String(value)).replace(/%3A/gi, ":");
}

function cgiPath(pathname, pairs) {
  const query = pairs
    .filter(([, value]) => value != null && String(value) !== "")
    .map(([key, value]) => `${key}=${encodeCgiValue(value)}`)
    .join("&");
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * ASI7213Y (firmware 2022) não tem AccessUser.cgi.
 * O cartão entra por recordUpdater e a face por FaceInfoManager.
 */
function buildLegacyCardInsertPath({ userId, userName, validFrom, validTo }) {
  const id = String(userId);
  const name = String(userName || id).trim().slice(0, USER_NAME_MAX) || id;
  return cgiPath("/cgi-bin/recordUpdater.cgi", [
    ["action", "insert"],
    ["name", "AccessControlCard"],
    ["CardNo", id],
    ["UserID", id],
    ["CardName", name],
    ["CardStatus", "0"],
    ["CardType", "0"],
    ["UserType", "0"],
    ["Doors[0]", "0"],
    ["TimeSections[0]", "0"],
    ["ValidDateStart", validFrom || ""],
    ["ValidDateEnd", validTo || ""],
  ]);
}

function buildLegacyCardUpdatePath({ recNo, userName, validFrom, validTo }) {
  const name = String(userName || "").trim().slice(0, USER_NAME_MAX);
  return cgiPath("/cgi-bin/recordUpdater.cgi", [
    ["action", "update"],
    ["name", "AccessControlCard"],
    ["recno", recNo],
    ["CardName", name],
    ["CardStatus", "0"],
    ["ValidDateStart", validFrom || ""],
    ["ValidDateEnd", validTo || ""],
  ]);
}

function buildLegacyCardRemovePath(recNo) {
  return cgiPath("/cgi-bin/recordUpdater.cgi", [
    ["action", "remove"],
    ["name", "AccessControlCard"],
    ["recno", recNo],
  ]);
}

function buildLegacyCardFindPath(userId) {
  return cgiPath("/cgi-bin/recordFinder.cgi", [
    ["action", "find"],
    ["name", "AccessControlCard"],
    ["count", "20"],
    ["condition.UserID", String(userId)],
  ]);
}

function buildLegacyFaceRemovePath(userId) {
  return cgiPath("/cgi-bin/FaceInfoManager.cgi", [
    ["action", "remove"],
    ["UserID", String(userId)],
  ]);
}

function buildLegacyFaceBody({ userId, photoBase64 }) {
  return {
    UserID: String(userId),
    Info: { PhotoData: [photoBase64] },
  };
}

function parseCgiRecords(data) {
  const text = responseText(data);
  const records = [];
  const lineRe = /^records\[(\d+)\]\.([^=]+)=(.*)$/;
  for (const line of text.split(/\r?\n/)) {
    const match = lineRe.exec(line.trim());
    if (!match) continue;
    const index = Number(match[1]);
    const bucket = records[index] || {};
    bucket[match[2]] = match[3];
    records[index] = bucket;
  }
  return records.filter(Boolean);
}

function parseCgiRecNo(data) {
  const match = /RecNo=(\d+)/i.exec(responseText(data));
  return match ? match[1] : null;
}

function summarizeFail(data) {
  const codes = Array.isArray(data.FailCodes) ? data.FailCodes.join(",") : "";
  const list = Array.isArray(data.UserList) ? data.UserList : data.FaceList;
  const detail = Array.isArray(list)
    ? list
        .map((item) => item?.ErrorCode || item?.error || item?.message)
        .filter(Boolean)
        .join(",")
    : "";
  const parts = [codes, detail].filter(Boolean);
  return parts.length ? `Terminal recusou o cadastro (${parts.join(";")})` : "Terminal recusou o cadastro";
}

module.exports = {
  buildAccessUserRecord,
  buildInsertUserBody,
  buildInsertFaceBody,
  buildRemoveUserBody,
  interpretCgiResponse,
  encodeCgiValue,
  buildLegacyCardInsertPath,
  buildLegacyCardUpdatePath,
  buildLegacyCardRemovePath,
  buildLegacyCardFindPath,
  buildLegacyFaceRemovePath,
  buildLegacyFaceBody,
  parseCgiRecords,
  parseCgiRecNo,
};
