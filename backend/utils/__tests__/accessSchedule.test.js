/**
 * Testes da janela de horário de acesso de serviço.
 * Executar: node utils/__tests__/accessSchedule.test.js
 */
"use strict";

const assert = require("assert");
const {
  isCheckInAllowed,
  crossesMidnight,
  formatHm,
  toSqlTime,
  outsideScheduleReason,
  formatScheduleRange,
} = require("../accessSchedule");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

console.log("accessSchedule unit tests");

test("parse HH:mm e HH:mm:ss", () => {
  assert.strictEqual(formatHm("08:00"), "08:00");
  assert.strictEqual(formatHm("18:30:00"), "18:30");
  assert.strictEqual(toSqlTime("08:00"), "08:00:00");
});

test("noturno atravessa meia-noite", () => {
  assert.strictEqual(crossesMidnight("18:00", "08:00"), true);
  assert.strictEqual(crossesMidnight("08:00", "18:00"), false);
});

const comercial = {
  start_date: "2026-09-15",
  end_date: "2026-09-17",
  schedule_start: "08:00:00",
  schedule_end: "18:00:00",
  schedule_crosses_midnight: 0,
};

test("comercial: entrada às 10:00 no período", () => {
  assert.strictEqual(isCheckInAllowed("2026-09-15 10:00:00", comercial), true);
});

test("comercial: bloqueia 19:00", () => {
  assert.strictEqual(isCheckInAllowed("2026-09-15 19:00:00", comercial), false);
});

test("comercial: bloqueia dia fora do período", () => {
  assert.strictEqual(isCheckInAllowed("2026-09-18 10:00:00", comercial), false);
});

test("comercial: 08:00 e 18:00 inclusivos", () => {
  assert.strictEqual(isCheckInAllowed("2026-09-15 08:00:00", comercial), true);
  assert.strictEqual(isCheckInAllowed("2026-09-15 18:00:00", comercial), true);
});

const noturno = {
  start_date: "2026-09-15",
  end_date: "2026-09-17",
  schedule_start: "18:00:00",
  schedule_end: "08:00:00",
  schedule_crosses_midnight: 1,
};

test("noturno: 19:00 no primeiro dia", () => {
  assert.strictEqual(isCheckInAllowed("2026-09-15 19:00:00", noturno), true);
});

test("noturno: bloqueia 10:00 no primeiro dia", () => {
  assert.strictEqual(isCheckInAllowed("2026-09-15 10:00:00", noturno), false);
});

test("noturno: bloqueia 02:00 antes da primeira noite", () => {
  assert.strictEqual(isCheckInAllowed("2026-09-15 02:00:00", noturno), false);
});

test("noturno: 02:00 na madrugada seguinte", () => {
  assert.strictEqual(isCheckInAllowed("2026-09-16 02:00:00", noturno), true);
});

test("noturno: madrugada após o último dia", () => {
  assert.strictEqual(isCheckInAllowed("2026-09-18 02:00:00", noturno), true);
  assert.strictEqual(isCheckInAllowed("2026-09-18 09:00:00", noturno), false);
});

test("legado sem horário: qualquer hora no período", () => {
  const legacy = { start_date: "2026-09-15", end_date: "2026-09-17" };
  assert.strictEqual(isCheckInAllowed("2026-09-15 03:00:00", legacy), true);
  assert.strictEqual(isCheckInAllowed("2026-09-18 03:00:00", legacy), false);
});

test("mensagem fora do horário", () => {
  assert.strictEqual(
    outsideScheduleReason(noturno),
    "Fora do horário do acesso (18:00–08:00 do dia seguinte).",
  );
  assert.strictEqual(formatScheduleRange(comercial), "08:00–18:00");
});

console.log("all accessSchedule tests passed");
