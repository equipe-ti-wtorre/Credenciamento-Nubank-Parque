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
};
