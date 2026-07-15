const assert = require("assert");
const XLSX = require("xlsx");
const {
  foldText,
  normalizeHeader,
  parseUnifiedWorkbook,
  resolveByFoldedDescription,
  resolveDriverFromSheet,
  resolveDriverFromLinked,
  isExampleCollaboratorRow,
  isExampleVehicleRow,
  mapRowByHeaders,
  summarizeAxis,
  PREVIEW_TOKEN_CONSUMIDO,
} = require("../service-access-bulk-import");
const { buildServiceAccessUnifiedBulkTemplate } = require("../../../utils/buildUnifiedAccessTemplate");
const {
  savePreviewSession,
  getPreviewSession,
  deletePreviewSession,
} = require("../../bulk/previewSession");
const AppError = require("../../../utils/AppError");

function buildMinimalXlsx({ collaborators = [], vehicles = [] } = {}) {
  const wb = XLSX.utils.book_new();
  const colHeaders = [
    "Documento",
    "Tipo de documento",
    "Nome completo",
    "Função / Cargo",
    "RG",
    "Telefone",
  ];
  const vehHeaders = [
    "Placa",
    "Marca",
    "Modelo",
    "Motorista (documento)",
    "Cor",
    "Tipo",
    "Observações",
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([colHeaders, ...collaborators]),
    "Colaboradores",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([vehHeaders, ...vehicles]),
    "Veículos",
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
  console.log("service-access-bulk-import unit tests");

  test("normalizeHeader PT accents", () => {
    assert.strictEqual(normalizeHeader("Função / Cargo"), "funcao_cargo");
    assert.strictEqual(normalizeHeader("Motorista (documento)"), "motorista_documento");
    assert.strictEqual(normalizeHeader("Tipo de documento"), "tipo_de_documento");
  });

  test("foldText case/accent insensitive", () => {
    assert.strictEqual(foldText("Segurança"), foldText("SEGURANCA"));
    assert.strictEqual(foldText("  Roadie  "), "roadie");
  });

  test("resolveByFoldedDescription", () => {
    const roles = [
      { id_collaborator_role: 1, description: "Segurança" },
      { id_collaborator_role: 2, description: "Roadie" },
    ];
    const hit = resolveByFoldedDescription(roles, "seguranca", "id_collaborator_role");
    assert.ok(hit);
    assert.strictEqual(hit.id, 1);
    assert.strictEqual(
      resolveByFoldedDescription(roles, "Inexistente", "id_collaborator_role"),
      null,
    );
  });

  test("isExample rows", () => {
    assert.ok(
      isExampleCollaboratorRow({
        documento: "12345678901",
        nome_completo: "João da Silva",
      }),
    );
    assert.ok(isExampleVehicleRow({ placa: "ABC-1D23", marca: "Toyota" }));
    assert.ok(!isExampleCollaboratorRow({ documento: "11144477735", nome_completo: "Ana" }));
  });

  await testAsync("template sheets + parse headers + dropdowns XML", async () => {
    const fs = require("fs");
    const path = require("path");
    const { buffer } = await buildServiceAccessUnifiedBulkTemplate({
      types: [{ description: "CPF" }, { description: "RG" }],
      roles: [{ description: "Segurança" }],
    });
    const parsed = parseUnifiedWorkbook(
      buffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "t.xlsx",
    );
    assert.ok(parsed.collaborators.length >= 1);
    assert.ok(parsed.vehicles.length >= 1);
    const mapped = mapRowByHeaders(parsed.collaborators[0].raw);
    assert.ok(mapped.documento);
    assert.ok(mapped.tipo_de_documento);

    const tmp = path.join("/tmp", `tmpl-test-${Date.now()}.xlsx`);
    fs.writeFileSync(tmp, buffer);
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmp);
    const colab = wb.getWorksheet("Colaboradores");
    const model = colab.dataValidations.model || {};
    const formulae = Object.values(model).map((v) => (v.formulae && v.formulae[0]) || "");
    assert.ok(formulae.some((f) => String(f).includes("Listas!$A$")));
    assert.ok(formulae.some((f) => String(f).includes("Listas!$B$")));
    fs.unlinkSync(tmp);
  });

  test("422 missing sheet", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["a"]]), "Outra");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    assert.throws(
      () =>
        parseUnifiedWorkbook(
          buf,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "t.xlsx",
        ),
      (err) => err instanceof AppError && err.statusCode === 422,
    );
  });

  test("422 missing header column", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Documento", "Nome completo"], ["1", "x"]]),
      "Colaboradores",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Placa", "Marca", "Modelo"], ["ABC1D23", "A", "B"]]),
      "Veículos",
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    assert.throws(
      () =>
        parseUnifiedWorkbook(
          buf,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "t.xlsx",
        ),
      (err) => err instanceof AppError && err.statusCode === 422,
    );
  });

  await testAsync("resolveDriverFromSheet — colaborador com erro", async () => {
    const spreadsheetByDocument = new Map([
      ["29853070820", { line: 3, sessionIndex: 0 }],
    ]);
    const session = [{ cadastro: "erro", chave: { documento: "29853070820" }, erros: ["x"] }];
    const r = await resolveDriverFromSheet("29853070820", spreadsheetByDocument, session);
    assert.ok(r.error);
    assert.match(r.error, /erro/i);
  });

  await testAsync("resolveDriverFromSheet — ok", async () => {
    const spreadsheetByDocument = new Map([
      ["29853070820", { line: 2, sessionIndex: 0 }],
    ]);
    const session = [
      {
        cadastro: "novo",
        chave: { documento: "29853070820" },
        nome: "Daniel",
        existingId: null,
        validated: { name: "Daniel" },
      },
    ];
    const r = await resolveDriverFromSheet("29853070820", spreadsheetByDocument, session);
    assert.ok(r.found);
    assert.strictEqual(r.nome, "Daniel");
  });

  test("resolveDriverFromLinked", () => {
    const linked = [
      { id_collaborator: 9, document: "11144477735", name: "Ana" },
    ];
    const hit = resolveDriverFromLinked("111.444.777-35", linked);
    assert.ok(hit);
    assert.strictEqual(hit.id_collaborator, 9);
    assert.strictEqual(resolveDriverFromLinked("00000000000", linked), null);
  });

  test("summarizeAxis", () => {
    const s = summarizeAxis([
      { cadastro: "novo", vinculo: "a_vincular" },
      { cadastro: "atualizacao", vinculo: "ja_vinculado" },
      { cadastro: "erro", vinculo: "a_vincular" },
      { cadastro: "inalterado", vinculo: "a_vincular" },
    ]);
    assert.strictEqual(s.novos, 1);
    assert.strictEqual(s.atualizacoes, 1);
    assert.strictEqual(s.erros, 1);
    assert.strictEqual(s.inalterados, 1);
    assert.strictEqual(s.a_vincular, 3);
    assert.strictEqual(s.total, 4);
  });

  test("PREVIEW_TOKEN_CONSUMIDO on missing session", () => {
    assert.throws(
      () => getPreviewSession("missing-token", "service_access_unified", {
        consumedCode: PREVIEW_TOKEN_CONSUMIDO,
      }),
      (err) =>
        err instanceof AppError &&
        err.statusCode === 409 &&
        err.code === PREVIEW_TOKEN_CONSUMIDO,
    );
  });

  test("preview session save/get/delete one-shot", () => {
    const id = savePreviewSession({ kind: "service_access_unified", serviceId: 1, rows: [] });
    const s = getPreviewSession(id, "service_access_unified");
    assert.strictEqual(s.serviceId, 1);
    deletePreviewSession(id);
    assert.throws(
      () =>
        getPreviewSession(id, "service_access_unified", {
          consumedCode: PREVIEW_TOKEN_CONSUMIDO,
        }),
      (err) => err.code === PREVIEW_TOKEN_CONSUMIDO,
    );
  });

  test("custom xlsx with real-looking rows parses", () => {
    const buf = buildMinimalXlsx({
      collaborators: [
        ["11144477735", "CPF", "Ana Teste", "Segurança", "", "11999990000"],
      ],
      vehicles: [["FBW3B98", "VW", "Gol", "11144477735", "Branco", "Hatch", ""]],
    });
    const parsed = parseUnifiedWorkbook(
      buf,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "ok.xlsx",
    );
    assert.strictEqual(parsed.collaborators.length, 1);
    assert.strictEqual(parsed.vehicles.length, 1);
    const v = mapRowByHeaders(parsed.vehicles[0].raw);
    assert.strictEqual(v.motorista_documento, "11144477735");
  });

  console.log("All tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
