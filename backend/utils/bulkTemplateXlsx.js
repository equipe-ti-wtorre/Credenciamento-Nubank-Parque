const XLSX = require("xlsx");

function sendXlsx(res, { buffer, filename }) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

function buildWorkbookBuffer(sheets) {
  const workbook = XLSX.utils.book_new();
  for (const { name, headers, rows } of sheets) {
    const data = [headers, ...(rows || [])];
    const sheet = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildCollaboratorBulkTemplate({ types = [], roles = [] } = {}) {
  const cpfType = types.find((t) => String(t.description || "").trim().toUpperCase() === "CPF");
  const exampleDocTypeId =
    cpfType?.id_collaborator_document_type ?? types[0]?.id_collaborator_document_type ?? 1;
  const exampleRoleId = roles[0]?.id_collaborator_role ?? 1;

  const buffer = buildWorkbookBuffer([
    {
      name: "Colaboradores",
      headers: [
        "document",
        "id_collaborator_document_type",
        "name",
        "id_collaborator_role",
        "rg",
        "phone",
      ],
      rows: [
        ["12345678901", exampleDocTypeId, "João da Silva", exampleRoleId, "", "11999998888"],
      ],
    },
    {
      name: "Tipos documento",
      headers: ["id_collaborator_document_type", "description"],
      rows: types.map((t) => [t.id_collaborator_document_type, t.description]),
    },
    {
      name: "Funções",
      headers: ["id_collaborator_role", "description"],
      rows: roles.map((r) => [r.id_collaborator_role, r.description]),
    },
  ]);

  return { buffer, filename: "template-colaboradores.xlsx" };
}

function buildServiceAccessCollaboratorBulkTemplate({ types = [], roles = [] } = {}) {
  const cpfType = types.find((t) => String(t.description || "").trim().toUpperCase() === "CPF");
  const exampleDocTypeId =
    cpfType?.id_collaborator_document_type ?? types[0]?.id_collaborator_document_type ?? 1;
  const exampleRoleId = roles[0]?.id_collaborator_role ?? 1;

  const buffer = buildWorkbookBuffer([
    {
      name: "Colaboradores",
      headers: [
        "document",
        "id_collaborator_document_type",
        "name",
        "id_collaborator_role",
        "rg",
        "phone",
      ],
      rows: [
        ["12345678901", exampleDocTypeId, "João da Silva", exampleRoleId, "", "11999998888"],
      ],
    },
    {
      name: "Tipos documento",
      headers: ["id_collaborator_document_type", "description"],
      rows: types.map((t) => [t.id_collaborator_document_type, t.description]),
    },
    {
      name: "Funções",
      headers: ["id_collaborator_role", "description"],
      rows: roles.map((r) => [r.id_collaborator_role, r.description]),
    },
  ]);

  return { buffer, filename: "template-acesso-colaboradores.xlsx" };
}

function buildServiceAccessVehicleBulkTemplate() {
  const buffer = buildWorkbookBuffer([
    {
      name: "Veículos",
      headers: ["plate", "brand", "model", "color", "type", "description"],
      rows: [["ABC1D23", "Toyota", "Corolla", "Prata", "Sedan", ""]],
    },
  ]);

  return { buffer, filename: "template-acesso-veiculos.xlsx" };
}

function buildFleetVehicleBulkTemplate({ companies = [] } = {}) {
  const exampleCompanyId = companies[0]?.id_company ?? 1;
  const buffer = buildWorkbookBuffer([
    {
      name: "Veiculos",
      headers: ["id_company", "plate", "brand", "model", "color", "type", "description"],
      rows: [[exampleCompanyId, "ABC1D23", "Toyota", "Corolla", "Prata", "Sedan", ""]],
    },
    {
      name: "Empresas",
      headers: ["id_company", "fancy_name"],
      rows: companies.map((c) => [c.id_company, c.fancy_name || c.company_name || ""]),
    },
  ]);
  return { buffer, filename: "template-frota-veiculos.xlsx" };
}

const {
  buildServiceAccessUnifiedBulkTemplate,
} = require("./buildUnifiedAccessTemplate");

module.exports = {
  sendXlsx,
  buildCollaboratorBulkTemplate,
  buildServiceAccessCollaboratorBulkTemplate,
  buildServiceAccessVehicleBulkTemplate,
  buildFleetVehicleBulkTemplate,
  buildServiceAccessUnifiedBulkTemplate,
};
