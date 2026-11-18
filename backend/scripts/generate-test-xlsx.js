#!/usr/bin/env node
/**
 * Gera planilha de teste com empresas, colaboradores e veículos.
 * Colaboradores e veículos seguem o modelo de importação unificada.
 *
 * Uso: npm run generate-test-xlsx
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { isValidCnpj } = require("../utils/cnpj");
const { isValidCpf } = require("../utils/cpf");
const { isValidPlate, normalizePlate } = require("../utils/plate");
const { createAdminConnection } = require("./db-reset-shared");
const env = require("../config/env");

const OUT_DIR = path.resolve(__dirname, "../fixtures/teste");
const OUT_FILE = path.join(OUT_DIR, "dados-teste-empresas-colaboradores-veiculos.xlsx");

const COLLAB_PER_COMPANY = 4;
const VEHICLES_PER_COMPANY = 2;

const FALLBACK_COMPANY_TYPES = ["Empresa Padrão", "Produtora"];
const FALLBACK_ROLES = ["Técnico de Som", "Limpeza", "Segurança", "Roadie"];
const FALLBACK_DOC_TYPE = "CPF";

const COMPANIES = [
  {
    seed: 1,
    typeIndex: 0,
    company_name: "EVENTOS ALPHA SERVICOS LTDA",
    fancy_name: "Alpha Eventos",
    contact: "Carlos Mendes",
    department: "Operações",
    phone: "(11) 98888-0001",
    email: "carlos@alphaeventos.teste",
  },
  {
    seed: 2,
    typeIndex: 1,
    company_name: "PRODUTORA BETA SHOWS S.A.",
    fancy_name: "Beta Shows",
    contact: "Fernanda Lima",
    department: "Produção",
    phone: "(21) 97777-0002",
    email: "fernanda@betashows.teste",
  },
  {
    seed: 3,
    typeIndex: 0,
    company_name: "GAMMA SEGURANCA E LOGISTICA LTDA",
    fancy_name: "Gamma Segurança",
    contact: "Roberto Souza",
    department: "Segurança",
    phone: "(31) 96666-0003",
    email: "roberto@gammaseg.teste",
  },
  {
    seed: 4,
    typeIndex: 1,
    company_name: "DELTA PRODUCOES ARTISTICAS LTDA",
    fancy_name: "Delta Produções",
    contact: "Juliana Costa",
    department: "Artístico",
    phone: "(41) 95555-0004",
    email: "juliana@deltaproducoes.teste",
  },
  {
    seed: 5,
    typeIndex: 0,
    company_name: "OMEGA CATERING E SERVICOS LTDA",
    fancy_name: "Omega Catering",
    contact: "Marcos Oliveira",
    department: "Comercial",
    phone: "(51) 94444-0005",
    email: "marcos@omegacatering.teste",
  },
];

const FIRST_NAMES = [
  "Ana", "Bruno", "Carla", "Diego", "Elena", "Felipe", "Gabriela", "Hugo",
  "Isabela", "João", "Karina", "Lucas", "Marina", "Nicolas", "Olivia", "Pedro",
  "Queila", "Rafael", "Sofia", "Thiago",
];
const LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves",
  "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho",
  "Rocha", "Almeida", "Nascimento", "Araújo", "Melo", "Barbosa",
];
const BRANDS = [
  { brand: "Volkswagen", models: ["Gol", "Polo"] },
  { brand: "Fiat", models: ["Argo", "Strada"] },
  { brand: "Chevrolet", models: ["Onix", "Tracker"] },
  { brand: "Toyota", models: ["Yaris", "Hilux"] },
  { brand: "Honda", models: ["City", "HR-V"] },
];
const COLORS = ["Branco", "Preto", "Prata", "Cinza", "Azul"];
const VEHICLE_TYPES = ["Hatch", "Sedan", "SUV", "Pickup", "Van"];

function generateValidCnpj(seed) {
  const base = String(900000000000 + seed).padStart(12, "0").slice(0, 12);
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(base[i]) * weights1[i];
  let rem = sum % 11;
  const d1 = rem < 2 ? 0 : 11 - rem;
  const withD1 = base + String(d1);
  sum = 0;
  for (let i = 0; i < 13; i += 1) sum += Number(withD1[i]) * weights2[i];
  rem = sum % 11;
  const d2 = rem < 2 ? 0 : 11 - rem;
  return withD1 + String(d2);
}

function generateValidCpf(seed) {
  const base = String(900000000 + seed).padStart(9, "0").slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(base[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  const withD1 = base + String(d1);
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(withD1[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return withD1 + String(d2);
}

function generatePlate(index) {
  const letters = "ABCDEFGHJKLMNPRSTUVWXYZ";
  const a = letters[Math.floor(index / letters.length) % letters.length];
  const b = letters[index % letters.length];
  const n1 = index % 10;
  const mid = letters[(index * 3) % letters.length];
  const n2 = String((index * 7) % 100).padStart(2, "0");
  return normalizePlate(`T${a}${b}${n1}${mid}${n2}`);
}

function phoneFor(index) {
  const ddd = ["11", "21", "31", "41", "51"][index % 5];
  const num = String(910000000 + index);
  return `(${ddd}) 9${num.slice(1, 5)}-${num.slice(5)}`;
}

function textCell(cell, value) {
  cell.value = value == null ? "" : String(value);
  cell.numFmt = "@";
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D54E6" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 22;
}

async function loadLookups() {
  const connection = await createAdminConnection({ database: env.db.name });
  try {
    const [types] = await connection.query(
      "SELECT description FROM company_type ORDER BY id_company_type",
    );
    const [roles] = await connection.query(
      "SELECT description FROM collaborator_role ORDER BY description",
    );
    const [docs] = await connection.query(
      "SELECT description FROM collaborator_document_type ORDER BY id_collaborator_document_type",
    );
    const companyTypes = types.map((row) => row.description).filter(Boolean);
    const roleNames = roles.map((row) => row.description).filter(Boolean);
    const docType =
      docs.map((row) => row.description).find((d) => String(d).toUpperCase() === "CPF") ||
      docs[0]?.description ||
      FALLBACK_DOC_TYPE;
    return {
      companyTypes: companyTypes.length ? companyTypes : FALLBACK_COMPANY_TYPES,
      roles: roleNames.length ? roleNames : FALLBACK_ROLES,
      docType,
    };
  } finally {
    await connection.end();
  }
}

function buildRows(lookups) {
  const companies = COMPANIES.map((company) => {
    const cnpj = generateValidCnpj(company.seed);
    if (!isValidCnpj(cnpj)) throw new Error(`CNPJ inválido: ${cnpj}`);
    const type =
      lookups.companyTypes[company.typeIndex % lookups.companyTypes.length];
    return { ...company, cnpj, type };
  });

  const collaborators = [];
  const vehicles = [];
  let person = 0;
  let vehicleIndex = 0;

  companies.forEach((company, companyIndex) => {
    const companyPeople = [];
    for (let i = 0; i < COLLAB_PER_COMPANY; i += 1) {
      person += 1;
      const cpf = generateValidCpf(1000 + person);
      if (!isValidCpf(cpf)) throw new Error(`CPF inválido: ${cpf}`);
      const row = {
        documento: cpf,
        tipo: lookups.docType,
        nome: `${FIRST_NAMES[person % FIRST_NAMES.length]} ${LAST_NAMES[(person * 3) % LAST_NAMES.length]}`,
        funcao: lookups.roles[(companyIndex + i) % lookups.roles.length],
        telefone: phoneFor(person),
        empresa: company.fancy_name,
      };
      collaborators.push(row);
      companyPeople.push(row);
    }

    for (let i = 0; i < VEHICLES_PER_COMPANY; i += 1) {
      vehicleIndex += 1;
      const spec = BRANDS[vehicleIndex % BRANDS.length];
      const plate = generatePlate(vehicleIndex);
      if (!isValidPlate(plate)) throw new Error(`Placa inválida: ${plate}`);
      vehicles.push({
        placa: plate,
        marca: spec.brand,
        modelo: spec.models[i % spec.models.length],
        motorista: companyPeople[i % companyPeople.length].documento,
        cor: COLORS[vehicleIndex % COLORS.length],
        tipo: VEHICLE_TYPES[vehicleIndex % VEHICLE_TYPES.length],
        observacoes: "Veículo de teste",
        empresa: company.fancy_name,
      });
    }
  });

  return { companies, collaborators, vehicles };
}

async function writeWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Credenciamento";
  workbook.created = new Date();

  const instr = workbook.addWorksheet("Instruções");
  instr.getColumn(1).width = 110;
  const lines = [
    "Dados fictícios para teste. CNPJ, CPF e placas são válidos e não representam pessoas ou empresas reais.",
    "1. Cadastre as empresas da aba Empresas (tipo, CNPJ, razão social e nome fantasia).",
    "2. Importe as abas Colaboradores e Veículos pelo modelo unificado do sistema.",
    "3. A coluna Empresa usa o nome fantasia. Na importação da frota ela vincula o veículo. No cadastro de colaboradores, importe no contexto da empresa correspondente.",
    "4. Para zerar eventos, empresas, colaboradores, aprovações e acessos de novo: npm run purge-domain-data -- --dry-run e depois --force.",
  ];
  lines.forEach((line, index) => {
    instr.getCell(index + 1, 1).value = line;
  });

  const empresas = workbook.addWorksheet("Empresas");
  const companyHeaders = [
    "Tipo",
    "CNPJ",
    "Razão social",
    "Nome fantasia",
    "Contato",
    "Departamento",
    "Telefone",
    "E-mail",
  ];
  styleHeader(empresas.addRow(companyHeaders));
  rows.companies.forEach((company) => {
    const row = empresas.addRow([
      company.type,
      company.cnpj,
      company.company_name,
      company.fancy_name,
      company.contact,
      company.department,
      company.phone,
      company.email,
    ]);
    textCell(row.getCell(2), company.cnpj);
    textCell(row.getCell(7), company.phone);
  });
  empresas.columns = [
    { width: 18 },
    { width: 20 },
    { width: 40 },
    { width: 22 },
    { width: 22 },
    { width: 16 },
    { width: 18 },
    { width: 32 },
  ];

  const colab = workbook.addWorksheet("Colaboradores");
  styleHeader(
    colab.addRow([
      "Documento",
      "Tipo de documento",
      "Nome completo",
      "Função / Cargo",
      "RG",
      "Telefone",
      "Empresa",
    ]),
  );
  rows.collaborators.forEach((person) => {
    const row = colab.addRow([
      person.documento,
      person.tipo,
      person.nome,
      person.funcao,
      "",
      person.telefone,
      person.empresa,
    ]);
    textCell(row.getCell(1), person.documento);
    textCell(row.getCell(6), person.telefone);
  });
  colab.columns = [
    { width: 18 },
    { width: 20 },
    { width: 28 },
    { width: 20 },
    { width: 14 },
    { width: 18 },
    { width: 22 },
  ];

  const veic = workbook.addWorksheet("Veículos");
  styleHeader(
    veic.addRow([
      "Placa",
      "Marca",
      "Modelo",
      "Motorista (documento)",
      "Cor",
      "Tipo",
      "Observações",
      "Empresa",
    ]),
  );
  rows.vehicles.forEach((vehicle) => {
    const row = veic.addRow([
      vehicle.placa,
      vehicle.marca,
      vehicle.modelo,
      vehicle.motorista,
      vehicle.cor,
      vehicle.tipo,
      vehicle.observacoes,
      vehicle.empresa,
    ]);
    textCell(row.getCell(1), vehicle.placa);
    textCell(row.getCell(4), vehicle.motorista);
  });
  veic.columns = [
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 24 },
    { width: 14 },
    { width: 14 },
    { width: 22 },
    { width: 22 },
  ];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await workbook.xlsx.writeFile(OUT_FILE);
  return {
    file: OUT_FILE,
    empresas: rows.companies.length,
    colaboradores: rows.collaborators.length,
    veiculos: rows.vehicles.length,
  };
}

async function main() {
  const lookups = await loadLookups();
  const rows = buildRows(lookups);
  const summary = await writeWorkbook(rows);
  console.log(JSON.stringify({ ok: true, ...summary, lookups }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
