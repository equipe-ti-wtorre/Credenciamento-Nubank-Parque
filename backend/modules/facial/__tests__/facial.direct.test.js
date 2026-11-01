/**
 * Payloads Dahua e prazo extra de remoção da face.
 * Executar: node modules/facial/__tests__/facial.direct.test.js
 */
"use strict";

const assert = require("assert");
const {
  buildAccessUserRecord,
  buildInsertUserBody,
  buildInsertFaceBody,
  buildRemoveUserBody,
  interpretCgiResponse,
} = require("../dahua.payload");
const { periodEndPlusGrace, shouldRevokeAfterGrace } = require("../facial.expire.rules");
const {
  accessMethodLabel,
  accessStatusLabel,
  buildAccessQuery,
  parseAccessRecords,
  selectNewRecords,
  syntheticEventId,
} = require("../dahua.access");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

console.log("facial.direct unit tests");

test("monta insert de usuário, face e remove", () => {
  const record = buildAccessUserRecord({
    userId: 42,
    userName: "Maria da Silva com nome bem longo demais para o terminal",
    validFrom: "2026-10-06 00:00:00",
    validTo: "2026-10-06 23:59:59",
  });
  assert.strictEqual(record.UserID, "42");
  assert.strictEqual(record.UserName.length, 32);
  assert.strictEqual(record.ValidFrom, "2026-10-06 00:00:00");
  assert.strictEqual(record.ValidTo, "2026-10-06 23:59:59");

  const userBody = buildInsertUserBody(record);
  assert.strictEqual(userBody.UserList.length, 1);
  assert.strictEqual(userBody.UserList[0].UserID, "42");

  const faceBody = buildInsertFaceBody({ userId: 42, photoBase64: "abc" });
  assert.deepStrictEqual(faceBody.FaceList[0].PhotoData, ["abc"]);
  assert.deepStrictEqual(buildRemoveUserBody("42"), { UserIDList: ["42"] });
});

test("interpreta resposta CGI", () => {
  assert.strictEqual(interpretCgiResponse(200, "OK").ok, true);
  assert.strictEqual(interpretCgiResponse(200, { FailCount: 0 }).ok, true);
  assert.strictEqual(interpretCgiResponse(200, { FailCount: 1, FailCodes: [16] }).ok, false);
  assert.strictEqual(interpretCgiResponse(401, "").ok, false);
  assert.strictEqual(interpretCgiResponse(200, "User not exist").notFound, true);
});

test("fim do dia mais 4 horas", () => {
  const limit = periodEndPlusGrace("2026-10-06", 4);
  assert.strictEqual(limit.getFullYear(), 2026);
  assert.strictEqual(limit.getMonth(), 9);
  assert.strictEqual(limit.getDate(), 7);
  assert.strictEqual(limit.getHours(), 3);
  assert.strictEqual(limit.getMinutes(), 59);
  assert.strictEqual(limit.getSeconds(), 59);
});

test("acesso ainda dentro do prazo extra não remove", () => {
  const before = new Date(2026, 9, 7, 3, 0, 0);
  const after = new Date(2026, 9, 7, 4, 0, 0);
  assert.strictEqual(shouldRevokeAfterGrace(["2026-10-06"], before, 4), false);
  assert.strictEqual(shouldRevokeAfterGrace(["2026-10-06"], after, 4), true);
});

test("outro acesso ainda válido segura a face", () => {
  const afterFirst = new Date(2026, 9, 7, 4, 0, 0);
  assert.strictEqual(shouldRevokeAfterGrace(["2026-10-06", "2026-10-08"], afterFirst, 4), false);
  const afterBoth = new Date(2026, 9, 9, 4, 0, 0);
  assert.strictEqual(shouldRevokeAfterGrace(["2026-10-06", "2026-10-08"], afterBoth, 4), true);
});

test("sem acesso não há janela válida", () => {
  assert.strictEqual(shouldRevokeAfterGrace([], new Date(2026, 9, 6, 12, 0, 0), 4), true);
});

test("interpreta recordFinder em texto e JSON", () => {
  const text = [
    "found=2",
    "records[0].RecNo=10",
    "records[0].UserID=42",
    "records[0].CreateTime=1760533200",
    "records[0].Status=1",
    "records[0].ErrorCode=0",
    "records[0].Method=15",
    "records[1].RecNo=11",
    "records[1].UserID=7",
    "records[1].CreateTime=1760533300",
    "records[1].Status=0",
    "records[1].ErrorCode=16",
  ].join("\n");
  const parsed = parseAccessRecords(text);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].recNo, 10);
  assert.strictEqual(parsed[0].userId, "42");
  assert.strictEqual(parsed[0].blocked, false);
  assert.strictEqual(parsed[1].blocked, true);

  const fromJson = parseAccessRecords({
    records: [{ RecNo: 3, UserID: "9", CreateTime: "2026-10-15 10:00:00", Status: 1, ErrorCode: 0 }],
  });
  assert.strictEqual(fromJson[0].userId, "9");
  assert.ok(fromJson[0].eventTime);
});

test("falha de leitura não avança o cursor; lote recente só ancora", () => {
  const now = new Date("2026-10-15T12:00:00");
  const recent = new Date("2026-10-15T11:55:00").toISOString();
  const old = new Date("2026-10-01T08:00:00").toISOString();
  const baseline = selectNewRecords(
    null,
    [
      { recNo: 4, eventTime: old },
      { recNo: 9, eventTime: recent },
    ],
    now,
  );
  assert.strictEqual(baseline.baseline, true);
  assert.strictEqual(baseline.advance, true);
  assert.strictEqual(baseline.cursor, 9);
  assert.strictEqual(baseline.fresh.length, 0);

  const ignoredOld = selectNewRecords(null, [{ recNo: 4, eventTime: old }], now);
  assert.strictEqual(ignoredOld.advance, false);
  assert.strictEqual(ignoredOld.cursor, null);

  const next = selectNewRecords(9, [
    { recNo: 8, eventTime: recent, userId: "1" },
    { recNo: 12, eventTime: recent, userId: "2" },
  ], now);
  assert.strictEqual(next.advance, true);
  assert.strictEqual(next.cursor, 12);
  assert.strictEqual(next.fresh.length, 1);
  assert.strictEqual(next.fresh[0].recNo, 12);
});

test("consulta o terminal depois do cursor e gera id local", () => {
  const path = buildAccessQuery({ afterRecNo: 40, limit: 30 });
  assert.ok(path.includes("AccessControlCardRec"));
  assert.ok(path.includes("condition.RecNo[0]=%3E"));
  assert.ok(path.includes("condition.RecNo[1]=40"));
  assert.ok(!path.includes("StartTime"));
  const baselinePath = buildAccessQuery({ since: 1760533200, limit: 30 });
  assert.ok(baselinePath.includes("condition.StartTime=1760533200"));
  assert.ok(!baselinePath.includes("RecNo"));
  assert.strictEqual(syntheticEventId(2, 15), 1000000000000 + 2 * 10000000000 + 15);
});

test("traduz método e resultado da passagem", () => {
  assert.strictEqual(accessMethodLabel("15"), "Face");
  assert.strictEqual(accessMethodLabel(1), "Cartão");
  assert.strictEqual(accessMethodLabel("0"), "Senha");
  assert.strictEqual(accessMethodLabel("99"), "99");
  assert.strictEqual(accessMethodLabel(null), null);
  assert.strictEqual(accessStatusLabel("1", false), "Liberado");
  assert.strictEqual(accessStatusLabel("0", true), "Negado");
  assert.strictEqual(accessStatusLabel(null, true), "Negado");
  assert.strictEqual(accessStatusLabel(null, false), null);
});

console.log("facial.direct unit tests ok");
