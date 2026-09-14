/**
 * Testes da escolha do alvo de portaria a partir do colaborador (fluxo facial).
 * Executar: node modules/gate/__tests__/gate.collaborator-target.test.js
 */
"use strict";

const assert = require("assert");
const {
  selectCollaboratorGateTarget,
  resolveServiceCollaboratorNextAction,
  resolvePortariaListAction,
  wasReleasedToday,
} = require("../gate.collaborator-target");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

const TODAY = "2026-09-03";

function serviceRow(overrides = {}) {
  return {
    access_id: "svc-1",
    access_check_in: null,
    access_check_out: null,
    facial_released_at: null,
    ...overrides,
  };
}

function eventRow(overrides = {}) {
  return {
    access_id: "evt-1",
    access_check_in: null,
    access_check_out: null,
    facial_released_at: null,
    ...overrides,
  };
}

console.log("gate.collaborator-target unit tests");

test("sem facial_released_at hoje → facial entrada bloqueada", () => {
  const selected = selectCollaboratorGateTarget("CHECK_IN", {
    serviceRows: [serviceRow()],
    eventRows: [eventRow()],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.blocked, "FACIAL_ENTRY_NOT_RELEASED");
  assert.strictEqual(resolvePortariaListAction(serviceRow(), TODAY), "RELEASE_ACCESS");
});

test("liberado hoje, sem check-in → facial CHECK_IN", () => {
  const selected = selectCollaboratorGateTarget("CHECK_IN", {
    serviceRows: [
      serviceRow({
        access_id: "svc-released",
        facial_released_at: `${TODAY} 08:00:00`,
      }),
    ],
    eventRows: [],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.type, "SERVICE");
  assert.strictEqual(selected.row.access_id, "svc-released");
  assert.strictEqual(
    resolvePortariaListAction(
      serviceRow({ facial_released_at: `${TODAY} 08:00:00` }),
      TODAY,
    ),
    "CHECK_IN",
  );
});

test("stay aberto → CHECK_OUT", () => {
  const selected = selectCollaboratorGateTarget("CHECK_OUT", {
    serviceRows: [
      serviceRow({
        access_id: "svc-open",
        facial_released_at: `${TODAY} 08:00:00`,
        access_check_in: `${TODAY} 09:00:00`,
        access_check_out: null,
      }),
    ],
    eventRows: [],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.type, "SERVICE");
  assert.strictEqual(selected.row.access_id, "svc-open");
  assert.strictEqual(
    resolvePortariaListAction(
      serviceRow({
        facial_released_at: `${TODAY} 08:00:00`,
        access_check_in: `${TODAY} 09:00:00`,
      }),
      TODAY,
    ),
    "CHECK_OUT",
  );
});

test("véspera liberada + checkout → precisa Liberar acesso de novo", () => {
  const row = serviceRow({
    access_id: "svc-yesterday",
    facial_released_at: "2026-09-02 08:00:00",
    access_check_in: "2026-09-02 08:10:00",
    access_check_out: "2026-09-02 17:00:00",
  });
  const selected = selectCollaboratorGateTarget("CHECK_IN", {
    serviceRows: [row],
    eventRows: [],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.blocked, "FACIAL_ENTRY_NOT_RELEASED");
  assert.strictEqual(wasReleasedToday(row, TODAY), false);
  assert.strictEqual(resolvePortariaListAction(row, TODAY), "RELEASE_ACCESS");
});

test("CHECK_IN de ontem sem facial_released_at não libera facial hoje", () => {
  const selected = selectCollaboratorGateTarget("CHECK_IN", {
    serviceRows: [
      serviceRow({
        access_check_in: `${TODAY} 08:00:00`,
        access_check_out: `${TODAY} 12:00:00`,
      }),
    ],
    eventRows: [],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.blocked, "FACIAL_ENTRY_NOT_RELEASED");
  assert.strictEqual(
    wasReleasedToday(
      serviceRow({
        access_check_in: `${TODAY} 08:00:00`,
        access_check_out: `${TODAY} 12:00:00`,
      }),
      TODAY,
    ),
    false,
  );
});

test("facial entrada após saída no mesmo dia (já liberado) → CHECK_IN", () => {
  const selected = selectCollaboratorGateTarget("CHECK_IN", {
    serviceRows: [
      serviceRow({
        access_id: "svc-reentry",
        facial_released_at: `${TODAY} 07:50:00`,
        access_check_in: `${TODAY} 08:00:00`,
        access_check_out: `${TODAY} 12:00:00`,
      }),
    ],
    eventRows: [],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.type, "SERVICE");
  assert.strictEqual(selected.row.access_id, "svc-reentry");
  assert.strictEqual(
    resolveServiceCollaboratorNextAction({
      access_check_in: `${TODAY} 08:00:00`,
      access_check_out: `${TODAY} 12:00:00`,
    }),
    "CHECK_IN",
  );
});

test("ciclo completo hoje não bloqueia nova entrada se liberado", () => {
  const closed = serviceRow({
    facial_released_at: `${TODAY} 07:50:00`,
    access_check_in: `${TODAY} 08:00:00`,
    access_check_out: `${TODAY} 17:00:00`,
  });
  assert.strictEqual(resolveServiceCollaboratorNextAction(closed), "CHECK_IN");
  assert.strictEqual(wasReleasedToday(closed, TODAY), true);
  assert.strictEqual(resolvePortariaListAction(closed, TODAY), "CHECK_IN");
});

test("saída com permanência aberta só no evento → CHECK_OUT no evento", () => {
  const selected = selectCollaboratorGateTarget("CHECK_OUT", {
    serviceRows: [serviceRow()],
    eventRows: [
      eventRow({
        access_id: "evt-open",
        facial_released_at: `${TODAY} 09:00:00`,
        access_check_in: `${TODAY} 10:00:00`,
        access_check_out: null,
      }),
    ],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.type, "EVENT");
  assert.strictEqual(selected.row.access_id, "evt-open");
});

test("fora do período (sem candidatos) → vazio", () => {
  const selected = selectCollaboratorGateTarget("CHECK_IN", {
    serviceRows: [],
    eventRows: [],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.empty, true);
});

test("saída sem permanência aberta → vazio", () => {
  const selected = selectCollaboratorGateTarget("CHECK_OUT", {
    serviceRows: [serviceRow()],
    eventRows: [eventRow()],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.empty, true);
});

test("entrada com permanência aberta → OPEN_STAY_PENDING", () => {
  const selected = selectCollaboratorGateTarget("CHECK_IN", {
    serviceRows: [
      serviceRow({
        facial_released_at: `${TODAY} 08:00:00`,
        access_check_in: `${TODAY} 08:00:00`,
        access_check_out: null,
      }),
    ],
    eventRows: [eventRow()],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.blocked, "OPEN_STAY_PENDING");
});

test("serviço e evento liberados hoje: reentrada prioriza serviço", () => {
  const selected = selectCollaboratorGateTarget("CHECK_IN", {
    serviceRows: [
      serviceRow({
        access_id: "svc-prio",
        facial_released_at: `${TODAY} 07:00:00`,
        access_check_in: `${TODAY} 08:00:00`,
        access_check_out: `${TODAY} 12:00:00`,
      }),
    ],
    eventRows: [
      eventRow({
        access_id: "evt-other",
        facial_released_at: `${TODAY} 07:10:00`,
        access_check_in: `${TODAY} 09:00:00`,
        access_check_out: `${TODAY} 11:00:00`,
      }),
    ],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.type, "SERVICE");
  assert.strictEqual(selected.row.access_id, "svc-prio");
});

test("stay aberto com end_date anterior a hoje → PERIOD_EXPIRED", () => {
  assert.strictEqual(
    resolvePortariaListAction(
      serviceRow({
        access_check_in: "2026-09-02 09:00:00",
        end_date: "2026-09-02",
      }),
      TODAY,
    ),
    "PERIOD_EXPIRED",
  );
});

test("stay aberto com end_date hoje → CHECK_OUT", () => {
  assert.strictEqual(
    resolvePortariaListAction(
      serviceRow({
        access_check_in: `${TODAY} 09:00:00`,
        end_date: TODAY,
      }),
      TODAY,
    ),
    "CHECK_OUT",
  );
});

test("stay aberto multi-dia ainda vigente → CHECK_OUT", () => {
  assert.strictEqual(
    resolvePortariaListAction(
      serviceRow({
        access_check_in: "2026-09-01 09:00:00",
        end_date: "2026-09-10",
      }),
      TODAY,
    ),
    "CHECK_OUT",
  );
});

test("stay aberto com periodEnded true → PERIOD_EXPIRED", () => {
  assert.strictEqual(
    resolvePortariaListAction(
      serviceRow({ access_check_in: `${TODAY} 09:00:00` }),
      TODAY,
      { periodEnded: true },
    ),
    "PERIOD_EXPIRED",
  );
});

test("facial CHECK_OUT ainda encontra stay aberto mesmo com período expirado", () => {
  const selected = selectCollaboratorGateTarget("CHECK_OUT", {
    serviceRows: [
      serviceRow({
        access_id: "svc-expired",
        access_check_in: "2026-09-02 09:00:00",
        end_date: "2026-09-02",
      }),
    ],
    eventRows: [],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.type, "SERVICE");
  assert.strictEqual(selected.row.access_id, "svc-expired");
});

test("evento liberado hoje permite reentrada facial", () => {
  const selected = selectCollaboratorGateTarget("CHECK_IN", {
    serviceRows: [],
    eventRows: [
      eventRow({
        access_id: "evt-reentry",
        facial_released_at: `${TODAY} 08:50:00`,
        access_check_in: `${TODAY} 09:00:00`,
        access_check_out: `${TODAY} 11:00:00`,
      }),
    ],
    todayKey: TODAY,
  });
  assert.strictEqual(selected.type, "EVENT");
  assert.strictEqual(selected.row.access_id, "evt-reentry");
});
