/**
 * Testes leves do contrato do wizard (sem runner Angular no projeto).
 * Valida decisões default: master OFF, vínculo/função ON, erro fora.
 */
const assert = require("assert");

function initColDecisions(colaboradores) {
  const col = {};
  for (const row of colaboradores) {
    if (row.cadastro === "erro") continue;
    const camposMaster = {};
    for (const d of row.divergencias || []) {
      camposMaster[d.campo] = false;
    }
    col[row.linha] = {
      include: true,
      camposMaster,
      aplicarFuncao: true,
    };
  }
  return col;
}

function buildColaboradorDecisions(colDecisions) {
  const out = [];
  for (const [lineStr, state] of Object.entries(colDecisions)) {
    const linha = Number(lineStr);
    if (!state.include) {
      out.push({ linha, aplicar: false });
      continue;
    }
    out.push({
      linha,
      aplicar: true,
      camposMaster: Object.entries(state.camposMaster)
        .filter(([, v]) => v)
        .map(([k]) => k),
      aplicarFuncao: state.aplicarFuncao !== false,
    });
  }
  return out;
}

const decisions = initColDecisions([
  {
    linha: 2,
    cadastro: "atualizacao",
    divergencias: [
      { campo: "phone", rotulo: "Telefone" },
      { campo: "name", rotulo: "Nome" },
    ],
  },
  { linha: 3, cadastro: "erro", divergencias: [] },
  { linha: 4, cadastro: "inalterado", divergencias: [] },
]);

assert.ok(decisions[2]);
assert.strictEqual(decisions[2].camposMaster.phone, false);
assert.strictEqual(decisions[2].camposMaster.name, false);
assert.strictEqual(decisions[3], undefined);
assert.strictEqual(decisions[4].include, true);

const payload = buildColaboradorDecisions(decisions);
assert.deepStrictEqual(payload.find((p) => p.linha === 2).camposMaster, []);
assert.strictEqual(payload.find((p) => p.linha === 2).aplicarFuncao, true);

console.log("wizard decision defaults: ok");
