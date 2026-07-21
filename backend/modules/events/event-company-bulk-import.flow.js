const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { normalizeCpf } = require("../../utils/cpf");
const { isValidPlate } = require("../../utils/plate");
const helpers = require("../patrimonial/service-access-bulk-import");
const credentialsService = require("../credentials/credentials.service");
const vehicleService = require("./event-company-vehicle.service");

const EVENT_KIND = "event_company_unified";

const {
  PREVIEW_TOKEN_CONSUMIDO,
  MASTER_UPDATE_FIELDS,
  parseUnifiedWorkbook,
  resolveByFoldedDescription,
  resolveDriverFromSheet,
  resolveDriverFromLinked,
  isExampleCollaboratorRow,
  isExampleVehicleRow,
  mapRowByHeaders,
  normalizeCollabIncoming,
  normalizeVeicIncoming,
  loadLookups,
  summarizeAxis,
  findCollaboratorByDocType,
  findCollaboratorByDocumentAnyNormalized,
  findVehicleByPlateCompany,
  savePreviewSession,
  getPreviewSession,
  deletePreviewSession,
  validateDocumentByType,
  validateAndNormalizeCollaboratorPayload,
  buildFieldDiffs,
  pickUpdatePatch,
  MAX_ROWS,
  buildUnifiedTemplate,
} = helpers;

async function isCollaboratorLinked(eventId, companyId, collaboratorId) {
  const [rows] = await db.execute(
    `SELECT edcc.id_event_day_company_collaborator, edcc.id_collaborator_role
       FROM event_day_company_collaborator edcc
       INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
       INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
      WHERE ed.id_event = ? AND edc.id_company = ? AND edcc.id_collaborator = ?
      LIMIT 1`,
    [eventId, companyId, collaboratorId],
  );
  return rows[0] || null;
}

async function isVehicleLinked(eventId, companyId, vehicleId) {
  const [rows] = await db.execute(
    `SELECT edcv.id_event_day_company_vehicle
       FROM event_day_company_vehicle edcv
       INNER JOIN event_day_company edc ON edc.id_event_day_company = edcv.id_event_day_company
       INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
      WHERE ed.id_event = ? AND edc.id_company = ? AND edcv.id_vehicle = ?
      LIMIT 1`,
    [eventId, companyId, vehicleId],
  );
  return rows[0] || null;
}

async function listLinkedCollaborators(eventId, companyId) {
  const [rows] = await db.execute(
    `SELECT DISTINCT edcc.id_collaborator, edcc.id_collaborator_role, c.document, c.name,
            cdt.description AS document_type_description,
            cr.description AS role_description
       FROM event_day_company_collaborator edcc
       INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
       INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
       INNER JOIN collaborator c ON c.id_collaborator = edcc.id_collaborator
       INNER JOIN collaborator_document_type cdt
         ON cdt.id_collaborator_document_type = c.id_collaborator_document_type
       LEFT JOIN collaborator_role cr ON cr.id_collaborator_role = edcc.id_collaborator_role
      WHERE ed.id_event = ? AND edc.id_company = ?`,
    [eventId, companyId],
  );
  return rows;
}

async function previewUnifiedBulkImport(ctx) {
  const { eventId, companyId, eventName, companyName, file, userId } = ctx;
  const serviceId = Number(eventId);
  const serviceRow = {
    id_company: Number(companyId),
    start_date: null,
    end_date: null,
    finalidade: eventName || `Evento #${eventId}`,
    company_fancy_name: companyName || null,
  };

  const { collaborators: rawCols, vehicles: rawVehs } = parseUnifiedWorkbook(
    file.buffer,
    file.mimetype,
    file.originalname,
  );

  if (!rawCols.length && !rawVehs.length) {
    throw new AppError("Arquivo sem linhas de dados nas abas Colaboradores/Veículos.", 422);
  }
  if (rawCols.length + rawVehs.length > MAX_ROWS) {
    throw new AppError(`Limite de ${MAX_ROWS} linhas excedido.`, 422);
  }

  const { types, roles } = await loadLookups();
  const linkedCols = await listLinkedCollaborators(serviceId, serviceRow.id_company);

  const colaboradores = [];
  const sessionCollaborators = [];
  const spreadsheetByDocument = new Map();

  const indexSheetDocument = (document, line) => {
    const doc = String(document || "").trim();
    if (!doc) return;
    const entry = { line, sessionIndex: sessionCollaborators.length - 1 };
    spreadsheetByDocument.set(doc, entry);
    const cpf = typeof normalizeCpf === "function" ? normalizeCpf(doc) : null;
    if (cpf && cpf !== doc) spreadsheetByDocument.set(cpf, entry);
  };

  for (const item of rawCols) {
    const mapped = mapRowByHeaders(item.raw);
    if (isExampleCollaboratorRow(mapped)) continue;
    const incoming = normalizeCollabIncoming(mapped);
    const line = item.line;

    if (
      !incoming.documento &&
      !incoming.nome_completo &&
      !incoming.tipo_de_documento &&
      !incoming.funcao_cargo
    ) {
      continue;
    }

    const erros = [];
    if (!incoming.documento) erros.push("Documento obrigatório.");
    if (!incoming.tipo_de_documento) erros.push("Tipo de documento obrigatório.");
    if (!incoming.nome_completo) erros.push("Nome completo obrigatório.");
    if (!incoming.funcao_cargo) erros.push("Função / Cargo obrigatória.");

    const typeResolved = resolveByFoldedDescription(
      types,
      incoming.tipo_de_documento,
      "id_collaborator_document_type",
    );
    let roleResolved = resolveByFoldedDescription(
      roles,
      incoming.funcao_cargo,
      "id_collaborator_role",
    );
    if (incoming.tipo_de_documento && !typeResolved) {
      erros.push(`Tipo de documento fora da lista: ${incoming.tipo_de_documento}`);
    }
    if (incoming.funcao_cargo && !roleResolved) {
      erros.push(`Função / Cargo fora da lista: ${incoming.funcao_cargo}`);
    }

    const isRoleOnlyError = (msg) =>
      msg === "Função / Cargo obrigatória." ||
      msg.startsWith("Função / Cargo fora da lista");

    let normalizedDocument = null;

    if (erros.length) {
      const hasNonRoleErrors = erros.some((e) => !isRoleOnlyError(e));
      let roleOnlyHandled = false;

      if (
        !hasNonRoleErrors &&
        incoming.documento &&
        incoming.tipo_de_documento &&
        incoming.nome_completo &&
        typeResolved
      ) {
        const docResult = await validateDocumentByType(incoming.documento, typeResolved.id);
        if (!docResult.error) {
          normalizedDocument = docResult.value;
          const existing = await findCollaboratorByDocType(normalizedDocument, typeResolved.id);

          // Já cadastrado com função: usa a do master e segue o fluxo normal (libera veículos/motorista).
          if (!roleResolved && existing?.id_collaborator_role) {
            roleResolved = {
              id: existing.id_collaborator_role,
              description: existing.role_description || null,
            };
            for (let i = erros.length - 1; i >= 0; i -= 1) {
              if (isRoleOnlyError(erros[i])) erros.splice(i, 1);
            }
            roleOnlyHandled = true; // recuperado — não emitir erro nem continue
          } else if (!roleResolved) {
            const linkRecord = existing
              ? await isCollaboratorLinked(serviceId, serviceRow.id_company, existing.id_collaborator)
              : null;
            const vinculo = linkRecord ? "ja_vinculado" : "a_vincular";
            const resolvido = {
              id_collaborator_document_type: typeResolved.id,
              ...(existing ? { id_collaborator: existing.id_collaborator } : {}),
            };
            const row = {
              linha: line,
              cadastro: "erro",
              vinculo,
              chave: { documento: normalizedDocument, tipo: typeResolved.description },
              resolvido,
              divergencias: [],
              divergencias_vinculo: [],
              erros: [...erros],
              nome: incoming.nome_completo,
              pendente_funcao: true,
            };
            colaboradores.push(row);
            sessionCollaborators.push({
              ...row,
              existingId: existing?.id_collaborator || null,
              roleId: null,
              validated: null,
              linkRecord,
            });
            indexSheetDocument(normalizedDocument, line);
            roleOnlyHandled = true;
            continue;
          } else {
            // Função da planilha válida — limpa erros residuais e segue
            for (let i = erros.length - 1; i >= 0; i -= 1) {
              if (isRoleOnlyError(erros[i])) erros.splice(i, 1);
            }
            roleOnlyHandled = true;
          }
        } else {
          erros.push(docResult.error);
        }
      }

      if (erros.length && !roleOnlyHandled) {
        const row = {
          linha: line,
          cadastro: "erro",
          vinculo: "a_vincular",
          chave: { documento: incoming.documento, tipo: incoming.tipo_de_documento || null },
          resolvido: null,
          divergencias: [],
          divergencias_vinculo: [],
          erros,
          nome: incoming.nome_completo || null,
        };
        colaboradores.push(row);
        sessionCollaborators.push({
          ...row,
          existingId: null,
          roleId: roleResolved?.id || null,
          validated: null,
          linkRecord: null,
        });
        indexSheetDocument(incoming.documento || normalizedDocument, line);
        continue;
      }

      if (erros.length) {
        continue;
      }
      // erros vazios após recuperação de função → cai no fluxo normal abaixo
    }

    if (typeResolved) {
      const docResult = await validateDocumentByType(incoming.documento, typeResolved.id);
      if (docResult.error) erros.push(docResult.error);
      else normalizedDocument = docResult.value;
    }

    if (erros.length) {
      const row = {
        linha: line,
        cadastro: "erro",
        vinculo: "a_vincular",
        chave: { documento: incoming.documento, tipo: incoming.tipo_de_documento || null },
        resolvido: null,
        divergencias: [],
        divergencias_vinculo: [],
        erros,
        nome: incoming.nome_completo || null,
      };
      colaboradores.push(row);
      sessionCollaborators.push({
        ...row,
        existingId: null,
        roleId: roleResolved?.id || null,
        validated: null,
        linkRecord: null,
      });
      indexSheetDocument(incoming.documento || normalizedDocument, line);
      continue;
    }

    const existing = await findCollaboratorByDocType(normalizedDocument, typeResolved.id);
    const linkRecord = existing
      ? await isCollaboratorLinked(serviceId, serviceRow.id_company, existing.id_collaborator)
      : null;
    const vinculo = linkRecord ? "ja_vinculado" : "a_vincular";

    if (!existing) {
      const validated = await validateAndNormalizeCollaboratorPayload({
        document: normalizedDocument,
        id_collaborator_document_type: typeResolved.id,
        name: incoming.nome_completo,
        id_collaborator_role: roleResolved.id,
        rg: incoming.rg,
        phone: incoming.telefone,
        status: true,
      });
      if (validated.error) {
        const row = {
          linha: line,
          cadastro: "erro",
          vinculo,
          chave: { documento: normalizedDocument, tipo: typeResolved.description },
          resolvido: {
            id_collaborator_document_type: typeResolved.id,
            id_collaborator_role: roleResolved.id,
          },
          divergencias: [],
          divergencias_vinculo: [],
          erros: [validated.error],
          nome: incoming.nome_completo,
        };
        colaboradores.push(row);
        sessionCollaborators.push({
          ...row,
          existingId: null,
          roleId: roleResolved.id,
          validated: null,
          linkRecord: null,
        });
        indexSheetDocument(normalizedDocument, line);
        continue;
      }

      const row = {
        linha: line,
        cadastro: "novo",
        vinculo: "a_vincular",
        chave: { documento: validated.value.document, tipo: typeResolved.description },
        resolvido: {
          id_collaborator_document_type: validated.value.id_collaborator_document_type,
          id_collaborator_role: roleResolved.id,
        },
        divergencias: [],
        divergencias_vinculo: [],
        erros: [],
        nome: validated.value.name,
      };
      colaboradores.push(row);
      sessionCollaborators.push({
        ...row,
        existingId: null,
        roleId: roleResolved.id,
        validated: validated.value,
        linkRecord: null,
      });
      indexSheetDocument(validated.value.document, line);
      continue;
    }

    const masterRoleId = existing.id_collaborator_role ?? null;
    const masterRoleDesc =
      existing.role_description ||
      roles.find((r) => r.id_collaborator_role === masterRoleId)?.description ||
      null;
    const buildRoleDivergences = () =>
      masterRoleId != null &&
      roleResolved?.id != null &&
      Number(masterRoleId) !== Number(roleResolved.id)
        ? [
            {
              campo: "id_collaborator_role",
              rotulo: "Função / Cargo",
              atual: masterRoleDesc,
              novo: roleResolved.description,
            },
          ]
        : [];

    if (!existing.status) {
      const row = {
        linha: line,
        cadastro: "erro",
        vinculo,
        chave: { documento: existing.document, tipo: typeResolved.description },
        resolvido: {
          id_collaborator: existing.id_collaborator,
          id_collaborator_document_type: typeResolved.id,
          id_collaborator_role: roleResolved.id,
          ...(masterRoleId != null
            ? { id_collaborator_role_atual: Number(masterRoleId) }
            : {}),
        },
        divergencias: [],
        divergencias_vinculo: buildRoleDivergences(),
        erros: ["Colaborador inativo."],
        nome: existing.name,
      };
      colaboradores.push(row);
      sessionCollaborators.push({
        ...row,
        existingId: existing.id_collaborator,
        roleId: roleResolved.id,
        validated: null,
        linkRecord,
      });
      indexSheetDocument(existing.document, line);
      continue;
    }

    const [blacklist] = await db.execute(
      `SELECT 1 FROM collaborator_black_list WHERE id_collaborator = ? LIMIT 1`,
      [existing.id_collaborator],
    );
    if (blacklist.length) {
      const row = {
        linha: line,
        cadastro: "erro",
        vinculo,
        chave: { documento: existing.document, tipo: typeResolved.description },
        resolvido: {
          id_collaborator: existing.id_collaborator,
          id_collaborator_document_type: typeResolved.id,
          id_collaborator_role: roleResolved.id,
          ...(masterRoleId != null
            ? { id_collaborator_role_atual: Number(masterRoleId) }
            : {}),
        },
        divergencias: [],
        divergencias_vinculo: buildRoleDivergences(),
        erros: ["Colaborador consta na lista de bloqueio."],
        nome: existing.name,
      };
      colaboradores.push(row);
      sessionCollaborators.push({
        ...row,
        existingId: existing.id_collaborator,
        roleId: roleResolved.id,
        validated: null,
        linkRecord,
      });
      indexSheetDocument(existing.document, line);
      continue;
    }

        const masterIncoming = {
      name: incoming.nome_completo,
      rg: incoming.rg !== undefined ? incoming.rg || null : existing.rg,
      phone: incoming.telefone !== undefined ? incoming.telefone || null : existing.phone,
    };
    const masterExisting = {
      name: existing.name,
      rg: existing.rg || null,
      phone: existing.phone || null,
    };
    const masterDiffs = buildFieldDiffs(masterExisting, masterIncoming, MASTER_UPDATE_FIELDS).map(
      (d) => ({
        campo: d.field,
        rotulo: d.field === "name" ? "Nome completo" : d.field === "rg" ? "RG" : "Telefone",
        atual: d.current,
        novo: d.incoming,
      }),
    );

    // Sempre cadastro (master) → planilha — decisão amarela no wizard
    const divergencias_vinculo = buildRoleDivergences();

    const cadastro = masterDiffs.length ? "atualizacao" : "inalterado";
    const row = {
      linha: line,
      cadastro,
      vinculo,
      chave: { documento: existing.document, tipo: typeResolved.description },
      resolvido: {
        id_collaborator: existing.id_collaborator,
        id_collaborator_document_type: typeResolved.id,
        id_collaborator_role: roleResolved.id,
        ...(masterRoleId != null
          ? { id_collaborator_role_atual: Number(masterRoleId) }
          : {}),
      },
      divergencias: masterDiffs,
      divergencias_vinculo,
      erros: [],
      nome: existing.name,
    };
    colaboradores.push(row);
    sessionCollaborators.push({
      ...row,
      existingId: existing.id_collaborator,
      roleId: roleResolved.id,
      masterRoleId,
      validated: {
        name: masterIncoming.name,
        rg: masterIncoming.rg,
        phone: masterIncoming.phone,
        id_collaborator_role: roleResolved.id,
      },
      linkRecord,
    });
    indexSheetDocument(existing.document, line);
  }

  const veiculos = [];
  const sessionVehicles = [];

  for (const item of rawVehs) {
    const mapped = mapRowByHeaders(item.raw);
    if (isExampleVehicleRow(mapped)) continue;
    const incoming = normalizeVeicIncoming(mapped);
    const line = item.line;

    if (!incoming.placa && !incoming.marca && !incoming.modelo && !incoming.motorista_documento) {
      continue;
    }

    const erros = [];
    if (!incoming.placa) erros.push("Placa obrigatória.");
    else if (!isValidPlate(incoming.placa)) {
      erros.push("Placa inválida. Use formato antigo (AAA0000) ou Mercosul (AAA0A00).");
    }
    if (!incoming.marca) erros.push("Marca obrigatória.");
    if (!incoming.modelo) erros.push("Modelo obrigatório.");

    let driverInfo = null;
    let driverId = null;
    if (incoming.motorista_documento) {
      const fromSheet = await resolveDriverFromSheet(
        incoming.motorista_documento,
        spreadsheetByDocument,
        sessionCollaborators,
      );
      if (fromSheet.error) {
        erros.push(fromSheet.error);
      } else if (fromSheet.found) {
        driverInfo = {
          documento: fromSheet.documento,
          nome: fromSheet.nome,
          encontrado: true,
          origem: "planilha",
        };
        driverId = fromSheet.existingId || null;
      } else {
        const linked = resolveDriverFromLinked(incoming.motorista_documento, linkedCols);
        if (linked) {
          driverInfo = {
            documento: linked.document,
            nome: linked.name,
            encontrado: true,
            origem: "acesso",
          };
          driverId = linked.id_collaborator;
        } else {
          const master = await findCollaboratorByDocumentAnyNormalized(
            incoming.motorista_documento,
          );
          if (master) {
            erros.push(
              `Motorista ${incoming.motorista_documento} existe no cadastro, mas não está na planilha nem neste acesso.`,
            );
          } else {
            erros.push(
              `Motorista (documento) não encontrado: ${incoming.motorista_documento}.`,
            );
          }
        }
      }
    }

    if (erros.length) {
      const row = {
        linha: line,
        cadastro: "erro",
        vinculo: "a_vincular",
        chave: { placa: incoming.placa || null },
        motorista:
          driverInfo ||
          (incoming.motorista_documento
            ? { documento: incoming.motorista_documento, nome: null, encontrado: false }
            : null),
        divergencias: [],
        erros,
      };
      veiculos.push(row);
      sessionVehicles.push({
        ...row,
        existingId: null,
        driverId: null,
        driverDocument: incoming.motorista_documento || null,
        validated: null,
        linkRecord: null,
      });
      continue;
    }

    const existing = await findVehicleByPlateCompany(serviceRow.id_company, incoming.placa);
    if (existing && !existing.status) {
      veiculos.push({
        linha: line,
        cadastro: "erro",
        vinculo: "a_vincular",
        chave: { placa: incoming.placa },
        motorista: driverInfo,
        divergencias: [],
        erros: ["Veículo inativo."],
      });
      sessionVehicles.push({
        linha: line,
        cadastro: "erro",
        existingId: existing.id_vehicle,
        driverId,
        driverDocument: incoming.motorista_documento || null,
        validated: null,
        linkRecord: null,
        erros: ["Veículo inativo."],
      });
      continue;
    }
    if (existing?.blacklist_reason) {
      veiculos.push({
        linha: line,
        cadastro: "erro",
        vinculo: "a_vincular",
        chave: { placa: incoming.placa },
        motorista: driverInfo,
        divergencias: [],
        erros: [`Veículo na lista de restrição: ${existing.blacklist_reason}`],
      });
      sessionVehicles.push({
        linha: line,
        cadastro: "erro",
        existingId: existing.id_vehicle,
        driverId,
        driverDocument: incoming.motorista_documento || null,
        validated: null,
        linkRecord: null,
        erros: [`Veículo na lista de restrição: ${existing.blacklist_reason}`],
      });
      continue;
    }

    const validated = {
      plate: incoming.placa,
      brand: incoming.marca,
      model: incoming.modelo,
      color: incoming.cor || null,
      type: incoming.tipo || null,
      description: incoming.observacoes || null,
      id_company: serviceRow.id_company,
    };

    if (!existing) {
      const row = {
        linha: line,
        cadastro: "novo",
        vinculo: "a_vincular",
        chave: { placa: incoming.placa },
        motorista: driverInfo,
        divergencias: [],
        erros: [],
      };
      veiculos.push(row);
      sessionVehicles.push({
        ...row,
        existingId: null,
        driverId,
        driverDocument: incoming.motorista_documento || null,
        validated,
        linkRecord: null,
      });
      continue;
    }

    const linkRecord = await isVehicleLinked(serviceId, serviceRow.id_company, existing.id_vehicle);
    const vinculo = linkRecord ? "ja_vinculado" : "a_vincular";
    const existingPublic = {
      brand: existing.brand,
      model: existing.model,
      color: existing.color,
      type: existing.type,
      description: existing.description,
    };
    const diffs = buildFieldDiffs(existingPublic, validated, [
      "brand",
      "model",
      "color",
      "type",
      "description",
    ]).map((d) => ({
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
      vinculo,
      chave: { placa: existing.plate },
      motorista: driverInfo,
      divergencias: diffs,
      erros: [],
    };
    veiculos.push(row);
    sessionVehicles.push({
      ...row,
      existingId: existing.id_vehicle,
      driverId,
      driverDocument: incoming.motorista_documento || null,
      validated,
      linkRecord,
    });
  }

  if (!colaboradores.length && !veiculos.length) {
    throw new AppError(
      "Nenhuma linha válida para importar (apenas exemplo ou linhas vazias).",
      422,
    );
  }

  const previewToken = savePreviewSession({
    kind: EVENT_KIND,
    eventId: Number(serviceId),
    companyId: serviceRow.id_company,
    serviceId: Number(serviceId),
    userId: userId || null,
    collaborators: sessionCollaborators,
    vehicles: sessionVehicles,
  });

  return {
    arquivo: file.originalname || "importacao.xlsx",
    previewToken,
    acesso: {
      id: Number(serviceId),
      nome: serviceRow.finalidade || `Evento #${serviceId}`,
      empresa: serviceRow.company_fancy_name || null,
    },
    resumo: {
      colaboradores: summarizeAxis(colaboradores),
      veiculos: summarizeAxis(veiculos),
    },
    colaboradores,
    veiculos,
    updateFields: {
      colaboradorMaster: MASTER_UPDATE_FIELDS,
      colaboradorVinculo: ["id_collaborator_role"],
      veiculo: ["brand", "model", "color", "type", "description"],
    },
  };
}

async function confirmUnifiedBulkImport(ctx) {
  const { eventId, companyId, links, previewToken, decisoes, userId, req } = ctx;
  const session = getPreviewSession(previewToken, EVENT_KIND, {
    consumedCode: PREVIEW_TOKEN_CONSUMIDO,
  });
  if (
    Number(session.eventId || session.serviceId) !== Number(eventId) ||
    Number(session.companyId) !== Number(companyId)
  ) {
    throw new AppError("Pré-visualização de outro evento/empresa.", 400);
  }

  const colDecisions = Array.isArray(decisoes?.colaboradores) ? decisoes.colaboradores : [];
  const vehDecisions = Array.isArray(decisoes?.veiculos) ? decisoes.veiculos : [];
  const colByLine = new Map(session.collaborators.map((r) => [r.linha, r]));
  const vehByLine = new Map(session.vehicles.map((r) => [r.linha, r]));

  const result = {
    colaboradores: { inseridos: 0, atualizados: 0, vinculados: 0, ignorados: 0, erros: [] },
    veiculos: { inseridos: 0, atualizados: 0, vinculados: 0, ignorados: 0, erros: [] },
    motoristas: 0,
  };

  const initialStatus = await credentialsService.resolveInitialStatus(req);
  const createdDocToId = new Map();

  for (const decision of colDecisions) {
    const line = Number(decision.linha ?? decision.line);
    const row = colByLine.get(line);
    if (!row) {
      result.colaboradores.erros.push({ linha: line, motivo: "Linha não encontrada." });
      continue;
    }
    if (decision.aplicar === false || decision.action === "skip") {
      result.colaboradores.ignorados += 1;
      continue;
    }
    if (row.cadastro === "erro") {
      result.colaboradores.erros.push({
        linha: line,
        motivo: (row.erros && row.erros[0]) || "Linha com erro.",
      });
      continue;
    }

    try {
      let collaboratorId = row.existingId;
      if (row.cadastro === "novo") {
        if (!row.validated) throw new AppError("Cadastro novo sem dados validados.", 400);
        const [ins] = await db.execute(
          `INSERT INTO collaborator (
             id_collaborator_document_type, id_collaborator_role,
             document, name, rg, phone, status
           ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [
            row.validated.id_collaborator_document_type,
            row.validated.id_collaborator_role,
            row.validated.document,
            row.validated.name,
            row.validated.rg || null,
            row.validated.phone || null,
          ],
        );
        collaboratorId = ins.insertId;
        createdDocToId.set(row.validated.document, collaboratorId);
        result.colaboradores.inseridos += 1;
      } else if (row.existingId) {
        const masterFields = Array.isArray(decision.camposMaster)
          ? decision.camposMaster
          : [];
        if (masterFields.length && row.validated) {
          const patch = pickUpdatePatch(row.validated, masterFields, MASTER_UPDATE_FIELDS);
          if (Object.keys(patch).length) {
            const [curRows] = await db.execute(
              `SELECT * FROM collaborator WHERE id_collaborator = ? LIMIT 1`,
              [row.existingId],
            );
            const cur = curRows[0];
            if (cur) {
              await db.execute(
                `UPDATE collaborator SET name = ?, rg = ?, phone = ? WHERE id_collaborator = ?`,
                [
                  patch.name !== undefined ? patch.name : cur.name,
                  patch.rg !== undefined ? patch.rg : cur.rg,
                  patch.phone !== undefined ? patch.phone : cur.phone,
                  row.existingId,
                ],
              );
              result.colaboradores.atualizados += 1;
            }
          }
        }
      }

      if (!collaboratorId) {
        result.colaboradores.erros.push({ linha: line, motivo: "Sem ID de colaborador." });
        continue;
      }

      const applyRole = decision.aplicarFuncao === true;
      const roleId = applyRole
        ? row.roleId
        : row.linkRecord?.id_collaborator_role || row.masterRoleId || row.roleId || null;
      if (!roleId) {
        result.colaboradores.erros.push({
          linha: line,
          motivo: "Função / Cargo obrigatória para vincular.",
        });
        continue;
      }

      await require("../collaborators/collaborator.service").linkCollaboratorToCompany(
        collaboratorId,
        companyId,
      );

      let linkedAny = false;
      for (const link of links) {
        try {
          await credentialsService.createCredential(req, {
            id_event_day_company: Number(link.id_event_day_company),
            id_collaborator: collaboratorId,
            id_collaborator_role: roleId,
          });
          linkedAny = true;
        } catch (err) {
          if (
            err.statusCode === 409 ||
            /já credenciado|já existe|duplicad/i.test(err.message || "")
          ) {
            continue;
          }
          throw err;
        }
      }
      if (linkedAny && row.vinculo === "a_vincular") {
        result.colaboradores.vinculados += 1;
      }
      if (row.chave?.documento) {
        createdDocToId.set(row.chave.documento, collaboratorId);
      }
    } catch (err) {
      result.colaboradores.erros.push({
        linha: line,
        motivo: err instanceof AppError ? err.message : "Erro ao aplicar colaborador.",
      });
    }
  }

  for (const row of session.collaborators) {
    if (row.existingId && row.chave?.documento) {
      createdDocToId.set(row.chave.documento, row.existingId);
    }
  }

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
      let vehicleId = row.existingId;
      if (row.cadastro === "novo") {
        const v = row.validated;
        const [ins] = await db.execute(
          `INSERT INTO vehicle (id_company, plate, brand, model, color, type, description, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            companyId,
            v.plate,
            v.brand,
            v.model,
            v.color || null,
            v.type || null,
            v.description || null,
          ],
        );
        vehicleId = ins.insertId;
        result.veiculos.inseridos += 1;
      } else if (row.existingId && row.validated) {
        const fields = Array.isArray(decision.campos)
          ? decision.campos
          : ["brand", "model", "color", "type", "description"];
        const patch = pickUpdatePatch(row.validated, fields, [
          "brand",
          "model",
          "color",
          "type",
          "description",
        ]);
        if (Object.keys(patch).length) {
          const [curRows] = await db.execute(
            `SELECT * FROM vehicle WHERE id_vehicle = ? LIMIT 1`,
            [row.existingId],
          );
          const cur = curRows[0];
          if (cur) {
            await db.execute(
              `UPDATE vehicle SET brand = ?, model = ?, color = ?, type = ?, description = ?
               WHERE id_vehicle = ?`,
              [
                patch.brand !== undefined ? patch.brand : cur.brand,
                patch.model !== undefined ? patch.model : cur.model,
                patch.color !== undefined ? patch.color : cur.color,
                patch.type !== undefined ? patch.type : cur.type,
                patch.description !== undefined ? patch.description : cur.description,
                row.existingId,
              ],
            );
            result.veiculos.atualizados += 1;
          }
        }
      }

      if (!vehicleId) {
        result.veiculos.erros.push({ linha: line, motivo: "Sem ID de veículo." });
        continue;
      }

      const createdLinks = await vehicleService.linkVehicleToAllCompanyDays(
        db,
        links,
        vehicleId,
        initialStatus,
      );
      if (createdLinks > 0 || row.vinculo === "a_vincular") {
        result.veiculos.vinculados += 1;
      }
    } catch (err) {
      result.veiculos.erros.push({
        linha: line,
        motivo: err instanceof AppError ? err.message : "Erro ao aplicar veículo.",
      });
    }
  }

  deletePreviewSession(previewToken);
  result.importedBy = userId || null;
  result.importedAt = new Date().toISOString();
  return result;
}

module.exports = {
  previewUnifiedBulkImport,
  confirmUnifiedBulkImport,
};
