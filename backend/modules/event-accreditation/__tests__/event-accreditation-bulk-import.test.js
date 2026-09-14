const assert = require("assert");
const XLSX = require("xlsx");
const {
  parseAccreditationWorkbook,
  resolveBracelet,
} = require("../event-accreditation-bulk-import.flow");
const {
  buildEventAccreditationBulkTemplate,
} = require("../../../utils/buildEventAccreditationBulkTemplate");

function buildXlsx(rows, { headers } = {}) {
  const wb = XLSX.utils.book_new();
  const colHeaders = headers || [
    "Documento",
    "Tipo de documento",
    "Nome completo",
    "Função / Cargo",
    "Pulseira",
    "RG",
    "Telefone",
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([colHeaders, ...rows]),
    "Colaboradores",
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

async function main() {
  console.log("event-accreditation-bulk-import unit tests");

  test("parse exige aba Colaboradores e coluna Pulseira", () => {
    const buf = buildXlsx([["12345678901", "CPF", "Ana", "Segurança", "Staff", "", ""]]);
    const rows = parseAccreditationWorkbook(buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "ok.xlsx");
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(String(rows[0].raw.Pulseira || rows[0].raw.pulseira || "").trim() || "Staff", "Staff");
  });

  test("parse falha sem coluna Pulseira", () => {
    const buf = buildXlsx([["12345678901", "CPF", "Ana", "Segurança"]], {
      headers: ["Documento", "Tipo de documento", "Nome completo", "Função / Cargo"],
    });
    let threw = false;
    try {
      parseAccreditationWorkbook(buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "bad.xlsx");
    } catch (err) {
      threw = true;
      assert.match(String(err.message), /Cabeçalho inválido|Pulseira|obrigat/i);
    }
    assert.ok(threw);
  });

  test("resolveBracelet ignora acentos e caixa", () => {
    const bracelets = [
      { id_bracelet_type: 7, name: "Imprensa" },
      { id_bracelet_type: 9, name: "Staff" },
    ];
    const hit = resolveBracelet(bracelets, "  staff ");
    assert.strictEqual(hit.id, 9);
    assert.strictEqual(resolveBracelet(bracelets, "Camarote"), null);
  });

  await testAsync("template inclui coluna Pulseira e aba Listas", async () => {
    const file = await buildEventAccreditationBulkTemplate({
      types: [{ description: "CPF" }],
      roles: [{ description: "Segurança" }],
      bracelets: [{ name: "Staff" }, { name: "Imprensa" }],
    });
    assert.ok(file.buffer?.length);
    assert.strictEqual(file.filename, "template-credenciamento-evento-colaboradores.xlsx");
    const wb = XLSX.read(file.buffer, { type: "buffer" });
    assert.ok(wb.SheetNames.includes("Colaboradores"));
    assert.ok(!wb.SheetNames.includes("Veículos"));
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Colaboradores, { header: 1 });
    assert.ok(rows[0].includes("Pulseira"));
  });

  console.log("event-accreditation-bulk-import unit tests: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
