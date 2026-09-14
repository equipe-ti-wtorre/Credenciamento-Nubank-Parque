const ExcelJS = require("exceljs");

const HEADER_REQ = {
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D54E6" } },
  font: { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 },
  alignment: { vertical: "middle", horizontal: "center", wrapText: true },
};
const HEADER_OPT = {
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFB8CBF8" } },
  font: { bold: true, color: { argb: "FF14182B" }, name: "Calibri", size: 11 },
  alignment: { vertical: "middle", horizontal: "center", wrapText: true },
};
const EXAMPLE_FONT = { italic: true, color: { argb: "FF8B91A7" }, name: "Calibri", size: 11 };

function styleHeaderCell(cell, required, comment) {
  cell.fill = (required ? HEADER_REQ : HEADER_OPT).fill;
  cell.font = (required ? HEADER_REQ : HEADER_OPT).font;
  cell.alignment = (required ? HEADER_REQ : HEADER_OPT).alignment;
  if (comment) {
    cell.note = comment;
  }
}

function setTextColumns(sheet, colIndexes) {
  for (const idx of colIndexes) {
    sheet.getColumn(idx).numFmt = "@";
  }
}

/**
 * Modelo de indicação de colaboradores no Credenciamento (ExcelJS).
 * Sem aba de veículos; pulseira do evento em menu suspenso.
 */
async function buildEventAccreditationBulkTemplate({
  types = [],
  roles = [],
  bracelets = [],
} = {}) {
  const typeDescs = types.map((t) => String(t.description || "").trim()).filter(Boolean);
  const roleDescs = roles.map((r) => String(r.description || "").trim()).filter(Boolean);
  const braceletNames = bracelets.map((b) => String(b.name || "").trim()).filter(Boolean);
  const firstType = typeDescs.find((d) => d.toUpperCase() === "CPF") || typeDescs[0] || "CPF";
  const firstRole = roleDescs[0] || "Segurança";
  const firstBracelet = braceletNames[0] || "";

  const typeEnd = Math.max(typeDescs.length, 1) + 1;
  const roleEnd = Math.max(roleDescs.length, 1) + 1;
  const braceletEnd = Math.max(braceletNames.length, 1) + 1;
  const dataRows = 502;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Credenciamento Nubank Parque";
  workbook.created = new Date();

  const colab = workbook.addWorksheet("Colaboradores");
  const instr = workbook.addWorksheet("Instruções");
  const listas = workbook.addWorksheet("Listas");

  listas.getCell("A1").value = "Tipos de documento";
  listas.getCell("B1").value = "Funções / Cargos";
  listas.getCell("C1").value = "Pulseiras";
  listas.getRow(1).font = { bold: true };
  typeDescs.forEach((v, i) => {
    listas.getCell(`A${i + 2}`).value = v;
  });
  roleDescs.forEach((v, i) => {
    listas.getCell(`B${i + 2}`).value = v;
  });
  braceletNames.forEach((v, i) => {
    listas.getCell(`C${i + 2}`).value = v;
  });
  listas.columns = [{ width: 22 }, { width: 28 }, { width: 24 }];

  const colHeaders = [
    { key: "Documento", req: true, comment: "Formato texto. CPF só dígitos. Ex.: 12345678901" },
    { key: "Tipo de documento", req: true, comment: "Selecione da lista: CPF, RG ou Passaporte." },
    { key: "Nome completo", req: true, comment: "Nome completo do colaborador." },
    { key: "Função / Cargo", req: true, comment: "Selecione uma função cadastrada no sistema." },
    { key: "Pulseira", req: true, comment: "Selecione uma pulseira habilitada neste credenciamento." },
    { key: "RG", req: false, comment: "Opcional. Formato texto." },
    { key: "Telefone", req: false, comment: "Opcional. Com DDD. Formato texto." },
  ];
  colHeaders.forEach((h, i) => {
    const cell = colab.getCell(1, i + 1);
    cell.value = h.key;
    styleHeaderCell(cell, h.req, h.comment);
  });
  colab.getRow(1).height = 28;

  ["12345678901", firstType, "João da Silva", firstRole, firstBracelet, "", "11999998888"].forEach(
    (v, i) => {
      const cell = colab.getCell(2, i + 1);
      cell.value = v;
      cell.font = EXAMPLE_FONT;
      cell.numFmt = "@";
    },
  );

  colab.columns = [
    { width: 18 },
    { width: 20 },
    { width: 28 },
    { width: 20 },
    { width: 20 },
    { width: 14 },
    { width: 16 },
  ];
  setTextColumns(colab, [1, 6, 7]);

  colab.dataValidations.add(`B2:B${dataRows}`, {
    type: "list",
    allowBlank: false,
    formulae: [`Listas!$A$2:$A$${typeEnd}`],
    showErrorMessage: true,
    errorStyle: "error",
    errorTitle: "Tipo inválido",
    error: "Selecione um tipo de documento da lista.",
    showInputMessage: true,
    promptTitle: "Tipo de documento",
    prompt: "Escolha CPF, RG ou Passaporte.",
  });
  colab.dataValidations.add(`D2:D${dataRows}`, {
    type: "list",
    allowBlank: false,
    formulae: [`Listas!$B$2:$B$${roleEnd}`],
    showErrorMessage: true,
    errorStyle: "error",
    errorTitle: "Função inválida",
    error: "Selecione uma função da lista.",
    showInputMessage: true,
    promptTitle: "Função / Cargo",
    prompt: "Escolha uma função cadastrada no sistema.",
  });
  colab.dataValidations.add(`E2:E${dataRows}`, {
    type: "list",
    allowBlank: false,
    formulae: [`Listas!$C$2:$C$${braceletEnd}`],
    showErrorMessage: true,
    errorStyle: "error",
    errorTitle: "Pulseira inválida",
    error: "Selecione uma pulseira habilitada neste credenciamento.",
    showInputMessage: true,
    promptTitle: "Pulseira",
    prompt: "Escolha uma pulseira da lista.",
  });

  [
    "Instruções — Importação de colaboradores do Credenciamento",
    "",
    "1. Preencha a aba Colaboradores. Cada linha vira uma indicação desta empresa.",
    "2. Não altere o nome da aba nem o cabeçalho da linha 1.",
    "3. Tipo de documento, Função / Cargo e Pulseira: use o menu suspenso (valores da aba Listas).",
    "4. Pulseira precisa ser uma das habilitadas neste credenciamento.",
    "5. Documento, Telefone e RG estão como Texto (preserva zeros à esquerda).",
    "6. A linha 2 de exemplo (João da Silva) é ignorada na importação — substitua ou apague.",
    "7. Cabeçalho azul escuro = obrigatório; azul claro = opcional.",
    "8. A importação não conclui a indicação da empresa — use “Concluir indicação” depois.",
  ].forEach((text, i) => {
    instr.getCell(i + 1, 1).value = text;
    if (i === 0) instr.getCell(i + 1, 1).font = { bold: true, size: 13 };
  });
  instr.getColumn(1).width = 110;

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: "template-credenciamento-evento-colaboradores.xlsx" };
}

module.exports = { buildEventAccreditationBulkTemplate };
