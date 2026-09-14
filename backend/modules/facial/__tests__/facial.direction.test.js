/**
 * Testes da direção do evento facial e do filtro de aplicação na portaria.
 * Executar: node modules/facial/__tests__/facial.direction.test.js
 */
"use strict";

const assert = require("assert");
const {
  resolveAccessDirection,
  directionToGateAction,
  shouldApplyFacialGate,
} = require("../facial.direction");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

console.log("facial.direction unit tests");

test("direcao do payload tem prioridade", () => {
  assert.strictEqual(
    resolveAccessDirection({ direcao: "saida", deviceId: "entrada-01" }),
    "saida",
  );
  assert.strictEqual(
    resolveAccessDirection({ direcao: "entrada", deviceId: "saida-02" }),
    "entrada",
  );
});

test("infere direção pelo prefixo do deviceId", () => {
  assert.strictEqual(resolveAccessDirection({ deviceId: "entrada-01" }), "entrada");
  assert.strictEqual(resolveAccessDirection({ deviceId: "entrada-02" }), "entrada");
  assert.strictEqual(resolveAccessDirection({ deviceId: "saida-01" }), "saida");
  assert.strictEqual(resolveAccessDirection({ deviceId: "saida-02" }), "saida");
});

test("infere direção pelo nome real do terminal", () => {
  assert.strictEqual(
    resolveAccessDirection({ deviceId: "Escritorio-Hall-Saida" }),
    "saida",
  );
  assert.strictEqual(
    resolveAccessDirection({ deviceId: "Escritorio-Hall-Entrada" }),
    "entrada",
  );
});

test("sem direção reconhecível retorna null", () => {
  assert.strictEqual(resolveAccessDirection({}), null);
  assert.strictEqual(resolveAccessDirection({ deviceId: "catraca-01" }), null);
  assert.strictEqual(resolveAccessDirection({ direcao: "lado" }), null);
});

test("mapeia direção para ação da portaria", () => {
  assert.strictEqual(directionToGateAction("entrada"), "CHECK_IN");
  assert.strictEqual(directionToGateAction("saida"), "CHECK_OUT");
  assert.strictEqual(directionToGateAction(null), null);
});

test("blocked ou duplicata não aplicam portaria", () => {
  assert.strictEqual(
    shouldApplyFacialGate({
      duplicate: true,
      blocked: false,
      collaboratorId: 42,
      direcao: "entrada",
    }),
    false,
  );
  assert.strictEqual(
    shouldApplyFacialGate({
      duplicate: false,
      blocked: true,
      collaboratorId: 42,
      direcao: "entrada",
    }),
    false,
  );
});

test("sem colaborador ou direção não aplicam portaria", () => {
  assert.strictEqual(
    shouldApplyFacialGate({
      duplicate: false,
      blocked: false,
      collaboratorId: null,
      direcao: "entrada",
    }),
    false,
  );
  assert.strictEqual(
    shouldApplyFacialGate({
      duplicate: false,
      blocked: false,
      collaboratorId: 42,
      direcao: null,
    }),
    false,
  );
});

test("evento válido aplica portaria", () => {
  assert.strictEqual(
    shouldApplyFacialGate({
      duplicate: false,
      blocked: false,
      collaboratorId: 42,
      direcao: "saida",
    }),
    true,
  );
});
