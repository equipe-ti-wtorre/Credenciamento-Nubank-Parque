const ExcelJS = require("exceljs");
const AppError = require("../../utils/AppError");
const { isValidPlate } = require("../../utils/plate");
const {
  parseUnifiedWorkbook,
  isExampleVehicleRow,
  mapRowByHeaders,
  normalizeVeicIncoming,
  buildVehiclePreviewDados,
  buildUnifiedTemplate,
  summarizeAxis,
  MAX_ROWS,
} = require("./service-access-bulk-import");
const { buildFieldDiffs, pickUpdatePatch } = require("../bulk/diff");
const {
  savePreviewSession,
  getPreviewSession,
  deletePreviewSession,
} = require("../bulk/previewSession");

const KIND = "fleet_vehicles_unified";
const VEHICLE_FIELDS = ["brand", "model", "color", "type", "description"];

function emptyColaboradoresAxis() {
  return {
    total: 0,
    novos: 0,
    atualizacoes: 0,
    inalterados: 0,
    erros: 0,
    a_vincular: 0,
    ja_vinculados: 0,
  };
}

function optionalTrim(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s !== "" ? s : undefined;
}

function foldText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Mesmo modelo unificado + coluna opcional Empresa na aba Veículos (admin).
 */
async function buildFleetUnifiedTemplate({ companies = [] } = {}) {
  const base = await buildUnifiedTemplate();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(base.buffer);

  const veic = workbook.getWorksheet("Veículos");
  if (veic) {
    // Coluna H — não desloca Cor/Tipo (E/F) nem as validações do modelo unificado.
    const col = 8;
    const header = veic.getCell(1, col);
    header.value = "Empresa";
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB8CBF8" } };
    header.font = { bold: true, color: { argb: "FF14182B" }, name: "Calibri", size: 11 };
    header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    header.note =
      "Obrigatório para perfil admin. Nome fantasia da empresa. Usuários de empresa podem deixar em branco.";
    veic.getColumn(col).width = 28;
    veic.getColumn(col).numFmt = "@";

    const exampleCompany = companies[0]?.fancy_name || companies[0]?.company_name || "";
    if (exampleCompany) {
      const cell = veic.getCell(2, col);
      cell.value = exampleCompany;
      cell.font = { italic: true, color: { argb: "FF8B91A7" }, name: "Calibri", size: 11 };
      cell.numFmt = "@";
    }

    if (companies.length) {
      let listas = workbook.getWorksheet("Listas");
      if (!listas) listas = workbook.addWorksheet("Listas");
      listas.getCell("E1").value = "Empresas";
      listas.getCell("E1").font = { bold: true };
      companies.forEach((c, i) => {
        listas.getCell(`E${i + 2}`).value = c.fancy_name || c.company_name || "";
      });
      const end = Math.max(companies.length, 1) + 1;
      veic.dataValidations.add(`H3:H502`, {
        type: "list",
        allowBlank: true,
        formulae: [`Listas!$E$2:$E$${end}`],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Empresa",
        error: "Selecione uma empresa da lista ou digite o nome fantasia.",
      });
    }
  }

  const instr = workbook.getWorksheet("Instruções");
  if (instr) {
    instr.getCell(1, 1).value = "Instruções — Importação unificada da Frota";
    instr.getCell(3, 1).value =
      "1. Preencha a aba Veículos. A aba Colaboradores pode ficar vazia (é ignorada na frota).";
    instr.getCell(4, 1).value =
      "2. Coluna Empresa: obrigatória para administradores; usuários de empresa podem deixar em branco.";
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: "template-acesso-servico.xlsx" };
}

function resolveCompanyFromRow(mapped, companiesByFold, resolveCompanyIdForCreate, req) {
  const rawId = mapped.id_company ?? mapped.empresa_id;
  let bodyCompanyId;
  if (rawId !== undefined && rawId !== null && String(rawId).trim() !== "") {
    const n = Number(rawId);
    if (Number.isFinite(n) && n > 0) bodyCompanyId = Math.trunc(n);
  }
  const empresaName = optionalTrim(mapped.empresa);
  if (bodyCompanyId == null && empresaName) {
    const hit = companiesByFold.get(foldText(empresaName));
    if (hit) bodyCompanyId = hit.id_company;
    else {
      throw new AppError(`Empresa não encontrada: ${empresaName}`, 400);
    }
  }
  return resolveCompanyIdForCreate(req, bodyCompanyId);
}

async function loadCompaniesForMatch(req, buildCompanyScope, applyScopeToWhere, db) {
  const scope = buildCompanyScope(req);
  if (scope.mode === "admin") {
    const [rows] = await db.execute(
      `SELECT id_company, fancy_name, company_name FROM company WHERE status = 1 ORDER BY fancy_name ASC LIMIT 500`,
    );
    return rows;
  }
  const id = scope.onlyCompanyId ?? scope.ownCompanyId;
  if (!id) return [];
  const [rows] = await db.execute(
    `SELECT id_company, fancy_name, company_name FROM company WHERE id_company = ? LIMIT 1`,
    [id],
  );
  return rows;
}

async function previewUnifiedFleetBulk(ctx) {
  const {
    req,
    file,
    resolveCompanyIdForCreate,
    findVehicleByCompanyPlate,
    buildCompanyScope,
    applyScopeToWhere,
    db,
  } = ctx;

  const { vehicles: rawVehs } = parseUnifiedWorkbook(
    file.buffer,
    file.mimetype,
    file.originalname,
  );

  if (!rawVehs.length) {
    throw new AppError("Arquivo sem linhas de dados na aba Veículos.", 422);
  }
  if (rawVehs.length > MAX_ROWS) {
    throw new AppError(`Limite de ${MAX_ROWS} linhas excedido.`, 422);
  }

  const companies = await loadCompaniesForMatch(req, buildCompanyScope, applyScopeToWhere, db);
  const companiesByFold = new Map();
  for (const c of companies) {
    const fancy = foldText(c.fancy_name);
    const name = foldText(c.company_name);
    if (fancy) companiesByFold.set(fancy, c);
    if (name) companiesByFold.set(name, c);
  }

  const veiculos = [];
  const sessionVehicles = [];

  for (const item of rawVehs) {
    const mapped = mapRowByHeaders(item.raw);
    if (isExampleVehicleRow(mapped)) continue;
    const incoming = normalizeVeicIncoming(mapped);
    const line = item.line;

    if (!incoming.placa && !incoming.marca && !incoming.modelo) continue;

    const erros = [];
    if (!incoming.placa) erros.push("Placa obrigatória.");
    if (!incoming.marca) erros.push("Marca obrigatória.");
    if (!incoming.modelo) erros.push("Modelo obrigatório.");
    if (incoming.placa && !isValidPlate(incoming.placa)) {
      erros.push("Placa inválida. Use formato antigo (AAA0000) ou Mercosul (AAA0A00).");
    }

    let idCompany = null;
    try {
      idCompany = resolveCompanyFromRow(mapped, companiesByFold, resolveCompanyIdForCreate, req);
    } catch (err) {
      erros.push(err.message || "Empresa inválida.");
    }

    const empresaNome =
      optionalTrim(mapped.empresa) ||
      (idCompany
        ? companies.find((c) => Number(c.id_company) === Number(idCompany))?.fancy_name ||
          companies.find((c) => Number(c.id_company) === Number(idCompany))?.company_name ||
          null
        : null);
    const dados = buildVehiclePreviewDados(incoming, { empresa: empresaNome });

    if (erros.length) {
      const row = {
        linha: line,
        cadastro: "erro",
        vinculo: "a_vincular",
        chave: { placa: incoming.placa || null },
        dados,
        motorista: null,
        divergencias: [],
        erros,
      };
      veiculos.push(row);
      sessionVehicles.push({
        ...row,
        existingId: null,
        idCompany,
        validated: null,
      });
      continue;
    }

    const validated = {
      id_company: idCompany,
      plate: incoming.placa,
      brand: incoming.marca || null,
      model: incoming.modelo || null,
      color: incoming.cor || null,
      type: incoming.tipo || null,
      description: incoming.observacoes || null,
    };

    const existing = await findVehicleByCompanyPlate(idCompany, incoming.placa);
    if (!existing) {
      const row = {
        linha: line,
        cadastro: "novo",
        vinculo: "a_vincular",
        chave: { placa: incoming.placa },
        dados,
        motorista: null,
        divergencias: [],
        erros: [],
      };
      veiculos.push(row);
      sessionVehicles.push({
        ...row,
        existingId: null,
        idCompany,
        validated,
      });
      continue;
    }

    if (existing.blacklist_reason) {
      const row = {
        linha: line,
        cadastro: "erro",
        vinculo: "a_vincular",
        chave: { placa: incoming.placa },
        dados,
        motorista: null,
        divergencias: [],
        erros: ["Veículo está na blacklist frota."],
      };
      veiculos.push(row);
      sessionVehicles.push({
        ...row,
        existingId: existing.id_vehicle,
        idCompany,
        validated: null,
      });
      continue;
    }

    if (!existing.status) {
      const row = {
        linha: line,
        cadastro: "erro",
        vinculo: "a_vincular",
        chave: { placa: incoming.placa },
        dados,
        motorista: null,
        divergencias: [],
        erros: ["Veículo inativo."],
      };
      veiculos.push(row);
      sessionVehicles.push({
        ...row,
        existingId: existing.id_vehicle,
        idCompany,
        validated: null,
      });
      continue;
    }

    const existingPublic = {
      brand: existing.brand || null,
      model: existing.model || null,
      color: existing.color || null,
      type: existing.type || null,
      description: existing.description || null,
    };
    const diffs = buildFieldDiffs(existingPublic, validated, VEHICLE_FIELDS).map((d) => ({
      campo: d.field,
      rotulo:
        d.field === "brand"
          ? "Marca"
          : d.field === "model"
            ? "Modelo"
            : d.field === "color"
              ? "Cor"
              : d.field === "type"
                ? "Tipo"
                : "Observações",
      atual: d.current,
      novo: d.incoming,
    }));

    const cadastro = diffs.length ? "atualizacao" : "inalterado";
    const row = {
      linha: line,
      cadastro,
      vinculo: "ja_vinculado",
      chave: { placa: incoming.placa },
      dados,
      motorista: null,
      divergencias: diffs,
      erros: [],
    };
    veiculos.push(row);
    sessionVehicles.push({
      ...row,
      existingId: existing.id_vehicle,
      idCompany,
      validated,
    });
  }

  if (!veiculos.length) {
    throw new AppError("Nenhuma linha de dados válida na aba Veículos.", 422);
  }

  const previewToken = savePreviewSession({
    kind: KIND,
    userId: req.user?.id || null,
    vehicles: sessionVehicles,
  });

  return {
    arquivo: file.originalname || "planilha.xlsx",
    previewToken,
    acesso: { id: 0, nome: "Cadastro de frota", empresa: null },
    resumo: {
      colaboradores: emptyColaboradoresAxis(),
      veiculos: summarizeAxis(veiculos),
    },
    colaboradores: [],
    veiculos,
    updateFields: {
      colaboradorMaster: [],
      colaboradorVinculo: [],
      veiculo: VEHICLE_FIELDS,
    },
  };
}

async function confirmUnifiedFleetBulk(ctx) {
  const { req, previewToken, decisoes, createVehicle, updateVehicle, hasPermission } = ctx;

  const session = getPreviewSession(previewToken, KIND);
  if (session.userId && req.user?.id && Number(session.userId) !== Number(req.user.id)) {
    throw new AppError("Pré-visualização pertence a outro usuário.", 403);
  }

  const vehDecisions = Array.isArray(decisoes?.veiculos) ? decisoes.veiculos : [];
  const vehByLine = new Map(session.vehicles.map((r) => [r.linha, r]));

  const result = {
    colaboradores: {
      inseridos: 0,
      atualizados: 0,
      vinculados: 0,
      ignorados: 0,
      erros: [],
    },
    veiculos: {
      inseridos: 0,
      atualizados: 0,
      vinculados: 0,
      ignorados: 0,
      erros: [],
    },
    motoristas: 0,
  };

  for (const decision of vehDecisions) {
    const line = Number(decision.linha ?? decision.line);
    const row = vehByLine.get(line);
    if (!row) {
      result.veiculos.erros.push({ linha: line, motivo: "Linha não encontrada." });
      continue;
    }
    if (decision.aplicar === false || decision.action === "skip") {
      result.veiculos.ignorados += 1;
      continue;
    }
    if (row.cadastro === "erro") {
      result.veiculos.erros.push({
        linha: line,
        motivo: (row.erros && row.erros[0]) || "Linha com erro.",
      });
      continue;
    }

    try {
      if (row.cadastro === "novo") {
        if (!row.validated) throw new AppError("Cadastro novo sem dados validados.", 400);
        if (!hasPermission(req.user, "fleet", "create")) {
          throw new AppError("Sem permissão para criar.", 403);
        }
        await createVehicle(req, row.validated);
        result.veiculos.inseridos += 1;
      } else if (row.existingId) {
        const fields = Array.isArray(decision.campos) ? decision.campos : [];
        if (!fields.length) {
          result.veiculos.vinculados += 1;
          continue;
        }
        if (!hasPermission(req.user, "fleet", "edit")) {
          throw new AppError("Sem permissão para editar.", 403);
        }
        const patch = pickUpdatePatch(row.validated || {}, fields, VEHICLE_FIELDS);
        if (!Object.keys(patch).length) {
          result.veiculos.ignorados += 1;
          continue;
        }
        await updateVehicle(req, row.existingId, patch);
        result.veiculos.atualizados += 1;
      }
    } catch (err) {
      result.veiculos.erros.push({
        linha: line,
        motivo: err instanceof AppError ? err.message : "Erro ao aplicar veículo.",
      });
    }
  }

  deletePreviewSession(previewToken);
  return result;
}

module.exports = {
  KIND,
  buildFleetUnifiedTemplate,
  previewUnifiedFleetBulk,
  confirmUnifiedFleetBulk,
};
