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

const SUGGESTED_COLORS = [
  "Prata",
  "Preto",
  "Branco",
  "Cinza",
  "Vermelho",
  "Azul",
  "Verde",
  "Amarelo",
  "Bege",
  "Marrom",
];
const SUGGESTED_TYPES = [
  "Sedan",
  "Hatch",
  "SUV",
  "Pickup",
  "Van",
  "Utilitário",
  "Motocicleta",
  "Caminhão",
];

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
 * Modelo unificado com menus suspensos (ExcelJS).
 * SheetJS community não grava dataValidations — por isso ExcelJS aqui.
 */
async function buildServiceAccessUnifiedBulkTemplate({ types = [], roles = [] } = {}) {
  const typeDescs = types.map((t) => String(t.description || "").trim()).filter(Boolean);
  const roleDescs = roles.map((r) => String(r.description || "").trim()).filter(Boolean);
  const firstType = typeDescs.find((d) => d.toUpperCase() === "CPF") || typeDescs[0] || "CPF";
  const firstRole = roleDescs[0] || "Segurança";

  const typeEnd = Math.max(typeDescs.length, 1) + 1;
  const roleEnd = Math.max(roleDescs.length, 1) + 1;
  const colorEnd = SUGGESTED_COLORS.length + 1;
  const tipoEnd = SUGGESTED_TYPES.length + 1;
  const dataRows = 502;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Credenciamento Nubank Parque";
  workbook.created = new Date();

  // Ordem das abas no arquivo: Colaboradores → Veículos → Instruções → Listas
  const colab = workbook.addWorksheet("Colaboradores");
  const veic = workbook.addWorksheet("Veículos");
  const instr = workbook.addWorksheet("Instruções");
  const listas = workbook.addWorksheet("Listas");

  listas.getCell("A1").value = "Tipos de documento";
  listas.getCell("B1").value = "Funções / Cargos";
  listas.getCell("C1").value = "Cores (sugestão)";
  listas.getCell("D1").value = "Tipos veículo (sugestão)";
  listas.getRow(1).font = { bold: true };
  typeDescs.forEach((v, i) => {
    listas.getCell(`A${i + 2}`).value = v;
  });
  roleDescs.forEach((v, i) => {
    listas.getCell(`B${i + 2}`).value = v;
  });
  SUGGESTED_COLORS.forEach((v, i) => {
    listas.getCell(`C${i + 2}`).value = v;
  });
  SUGGESTED_TYPES.forEach((v, i) => {
    listas.getCell(`D${i + 2}`).value = v;
  });
  listas.columns = [{ width: 22 }, { width: 28 }, { width: 20 }, { width: 24 }];

  const colHeaders = [
    { key: "Documento", req: true, comment: "Formato texto. CPF só dígitos. Ex.: 12345678901" },
    { key: "Tipo de documento", req: true, comment: "Selecione da lista: CPF, RG ou Passaporte." },
    { key: "Nome completo", req: true, comment: "Nome completo do colaborador." },
    { key: "Função / Cargo", req: true, comment: "Selecione uma função cadastrada no sistema." },
    { key: "RG", req: false, comment: "Opcional. Formato texto." },
    { key: "Telefone", req: false, comment: "Opcional. Com DDD. Formato texto." },
  ];
  colHeaders.forEach((h, i) => {
    const cell = colab.getCell(1, i + 1);
    cell.value = h.key;
    styleHeaderCell(cell, h.req, h.comment);
  });
  colab.getRow(1).height = 28;

  ["12345678901", firstType, "João da Silva", firstRole, "", "11999998888"].forEach((v, i) => {
    const cell = colab.getCell(2, i + 1);
    cell.value = v;
    cell.font = EXAMPLE_FONT;
    cell.numFmt = "@";
  });

  colab.columns = [
    { width: 18 },
    { width: 20 },
    { width: 28 },
    { width: 20 },
    { width: 14 },
    { width: 16 },
  ];
  setTextColumns(colab, [1, 5, 6]);

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

  const vehHeaders = [
    { key: "Placa", req: true, comment: "Formato texto. Ex.: ABC1D23 (Mercosul) ou ABC1234." },
    { key: "Marca", req: true, comment: "Fabricante do veículo." },
    { key: "Modelo", req: true, comment: "Modelo do veículo." },
    {
      key: "Motorista (documento)",
      req: false,
      comment: "Documento de um colaborador da aba Colaboradores (ou já vinculado ao acesso).",
    },
    { key: "Cor", req: false, comment: "Sugestão da lista — pode digitar outra." },
    { key: "Tipo", req: false, comment: "Sugestão da lista — pode digitar outra." },
    { key: "Observações", req: false, comment: "Texto livre opcional." },
  ];
  vehHeaders.forEach((h, i) => {
    const cell = veic.getCell(1, i + 1);
    cell.value = h.key;
    styleHeaderCell(cell, h.req, h.comment);
  });
  veic.getRow(1).height = 28;

  ["ABC1D23", "Toyota", "Corolla", "12345678901", "Prata", "Sedan", ""].forEach((v, i) => {
    const cell = veic.getCell(2, i + 1);
    cell.value = v;
    cell.font = EXAMPLE_FONT;
    cell.numFmt = "@";
  });

  veic.columns = [
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 22 },
    { width: 14 },
    { width: 14 },
    { width: 24 },
  ];
  setTextColumns(veic, [1, 4]);

  veic.dataValidations.add(`E2:E${dataRows}`, {
    type: "list",
    allowBlank: true,
    formulae: [`Listas!$C$2:$C$${colorEnd}`],
    showErrorMessage: true,
    errorStyle: "warning",
    errorTitle: "Cor",
    error: "Valor fora da sugestão — você pode manter se for intencional.",
  });
  veic.dataValidations.add(`F2:F${dataRows}`, {
    type: "list",
    allowBlank: true,
    formulae: [`Listas!$D$2:$D$${tipoEnd}`],
    showErrorMessage: true,
    errorStyle: "warning",
    errorTitle: "Tipo",
    error: "Valor fora da sugestão — você pode manter se for intencional.",
  });

  [
    "Instruções — Importação unificada do Acesso de Serviço",
    "",
    "1. Preencha a aba Colaboradores (obrigatória se houver pessoas a vincular).",
    "2. Preencha a aba Veículos (opcional). Motorista (documento) deve ser o documento de um colaborador da aba Colaboradores ou já vinculado ao acesso.",
    "3. Não altere os nomes das abas nem o cabeçalho da linha 1.",
    "4. Tipo de documento e Função / Cargo: use o menu suspenso (valores da aba Listas).",
    "5. Cor e Tipo do veículo: menu de sugestão — pode digitar outro valor.",
    "6. Documento, Telefone, RG, Placa e Motorista estão como Texto (preserva zeros à esquerda).",
    "7. A linha 2 de exemplo (João da Silva / ABC1D23) é ignorada na importação — substitua ou apague.",
    "8. Cabeçalho azul escuro = obrigatório; azul claro = opcional.",
    "9. Se Motorista estiver preenchido e a pessoa não for encontrada (ou estiver com erro na aba Colaboradores), a linha do veículo falha.",
  ].forEach((text, i) => {
    instr.getCell(i + 1, 1).value = text;
    if (i === 0) instr.getCell(i + 1, 1).font = { bold: true, size: 13 };
  });
  instr.getColumn(1).width = 110;

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: "template-acesso-servico.xlsx" };
}

module.exports = { buildServiceAccessUnifiedBulkTemplate };
