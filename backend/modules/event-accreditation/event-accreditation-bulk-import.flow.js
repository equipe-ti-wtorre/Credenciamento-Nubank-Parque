const XLSX = require("xlsx");
const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const helpers = require("../patrimonial/service-access-bulk-import");
const collaboratorService = require("../collaborators/collaborator.service");
const blocklistPolicy = require("../collaborator-blocklist/blocklist.policy");
const { STATUS_AGUARDANDO_PRODUTORA } = require("../credentials/credentials.schema");
const {
  buildEventAccreditationBulkTemplate,
} = require("../../utils/buildEventAccreditationBulkTemplate");

const KIND = "event_accreditation_company_unified";

const {
  PREVIEW_TOKEN_CONSUMIDO,
  MASTER_UPDATE_FIELDS,
  foldText,
  isExcelFile,
  findSheetName,
  sheetToObjects,
  assertHeaders,
  resolveByFoldedDescription,
  isExampleCollaboratorRow,
  mapRowByHeaders,
  normalizeCollabIncoming,
  loadLookups,
  summarizeAxis,
  findCollaboratorByDocType,
  savePreviewSession,
  getPreviewSession,
  deletePreviewSession,
  validateDocumentByType,
  validateAndNormalizeCollaboratorPayload,
  buildFieldDiffs,
  pickUpdatePatch,
  MAX_ROWS,
} = helpers;

const COLAB_REQUIRED_HEADERS = [
  "documento",
  "tipo_de_documento",
  "nome_completo",
  "funcao_cargo",
  "pulseira",
];

function parseAccreditationWorkbook(buffer, mimetype, originalname) {
  if (!buffer?.length) throw new AppError("Arquivo vazio.", 422);
  if (!isExcelFile(mimetype, originalname)) {
    throw new AppError("Formato inválido. Envie um arquivo .xlsx.", 422);
  }
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  const colName = findSheetName(workbook, "Colaboradores");
  if (!colName) {
    throw new AppError('Aba "Colaboradores" não encontrada no arquivo.', 422);
  }
  const colParsed = sheetToObjects(workbook.Sheets[colName]);
  assertHeaders(colParsed.headers, COLAB_REQUIRED_HEADERS, "Colaboradores");
  return colParsed.objects;
}

function normalizeIncoming(mapped) {
  const pulseiraRaw = mapped.pulseira != null ? String(mapped.pulseira).trim() : "";
  return {
    ...normalizeCollabIncoming(mapped),
    pulseira: pulseiraRaw,
  };
}

function resolveBracelet(bracelets, name) {
  const wanted = foldText(name);
  if (!wanted) return null;
  const hit = bracelets.find((b) => foldText(b.name) === wanted);
  return hit ? { id: hit.id_bracelet_type, name: hit.name } : null;
}

function isRoleOnlyError(msg) {
  return msg === "Função / Cargo obrigatória." || String(msg).startsWith("Função / Cargo fora da lista");
}

function isBraceletOnlyError(msg) {
  return msg === "Pulseira obrigatória." || String(msg).startsWith("Pulseira fora da lista");
}

function isRecoverableOnlyError(msg) {
  return isRoleOnlyError(msg) || isBraceletOnlyError(msg);
}

async function isCollaboratorLinked(accreditationCompanyId, collaboratorId) {
  const [rows] = await db.execute(
    `SELECT id_event_accreditation_collaborator, id_collaborator_role, id_bracelet_type
       FROM event_accreditation_collaborator
      WHERE id_event_accreditation_company = ? AND id_collaborator = ?
      LIMIT 1`,
    [accreditationCompanyId, collaboratorId],
  );
  return rows[0] || null;
}

function publicRow(row) {
  return {
    linha: row.linha,
    cadastro: row.cadastro,
    vinculo: row.vinculo,
    chave: row.chave,
    resolvido: row.resolvido || null,
    divergencias: row.divergencias || [],
    divergencias_vinculo: row.divergencias_vinculo || [],
    erros: row.erros || [],
    nome: row.nome || null,
    pulseira: row.pulseira || null,
    ...(row.pendente_funcao ? { pendente_funcao: true } : {}),
    ...(row.pendente_pulseira ? { pendente_pulseira: true } : {}),
  };
}

async function previewUnifiedBulkImport(ctx) {
  const {
    accreditationId,
    companyId,
    accreditationCompanyId,
    eventName,
    companyName,
    bracelets,
    file,
    userId,
  } = ctx;

  const rawCols = parseAccreditationWorkbook(file.buffer, file.mimetype, file.originalname);
  if (!rawCols.length) {
    throw new AppError("Arquivo sem linhas de dados na aba Colaboradores.", 422);
  }
  if (rawCols.length > MAX_ROWS) {
    throw new AppError(`Limite de ${MAX_ROWS} linhas excedido.`, 422);
  }

  const { types, roles } = await loadLookups();
  const colaboradores = [];
  const sessionCollaborators = [];

  for (const item of rawCols) {
    const mapped = mapRowByHeaders(item.raw);
    if (isExampleCollaboratorRow(mapped)) continue;
    const incoming = normalizeIncoming(mapped);
    const line = item.line;

    if (
      !incoming.documento &&
      !incoming.nome_completo &&
      !incoming.tipo_de_documento &&
      !incoming.funcao_cargo &&
      !incoming.pulseira
    ) {
      continue;
    }

    const erros = [];
    if (!incoming.documento) erros.push("Documento obrigatório.");
    if (!incoming.tipo_de_documento) erros.push("Tipo de documento obrigatório.");
    if (!incoming.nome_completo) erros.push("Nome completo obrigatório.");
    if (!incoming.funcao_cargo) erros.push("Função / Cargo obrigatória.");
    if (!incoming.pulseira) erros.push("Pulseira obrigatória.");

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
    let braceletResolved = resolveBracelet(bracelets, incoming.pulseira);

    if (incoming.tipo_de_documento && !typeResolved) {
      erros.push(`Tipo de documento fora da lista: ${incoming.tipo_de_documento}`);
    }
    if (incoming.funcao_cargo && !roleResolved) {
      erros.push(`Função / Cargo fora da lista: ${incoming.funcao_cargo}`);
    }
    if (incoming.pulseira && !braceletResolved) {
      erros.push(`Pulseira fora da lista: ${incoming.pulseira}`);
    }

    let normalizedDocument = null;
    let existing = null;
    let linkRecord = null;

    if (erros.length) {
      const hasHardErrors = erros.some((e) => !isRecoverableOnlyError(e));
      if (
        !hasHardErrors &&
        incoming.documento &&
        incoming.tipo_de_documento &&
        incoming.nome_completo &&
        typeResolved
      ) {
        const docResult = await validateDocumentByType(incoming.documento, typeResolved.id);
        if (docResult.error) {
          erros.push(docResult.error);
        } else {
          normalizedDocument = docResult.value;
          existing = await findCollaboratorByDocType(normalizedDocument, typeResolved.id);
          linkRecord = existing
            ? await isCollaboratorLinked(accreditationCompanyId, existing.id_collaborator)
            : null;

          if (!roleResolved && existing?.id_collaborator_role) {
            roleResolved = {
              id: existing.id_collaborator_role,
              description: existing.role_description || null,
            };
            for (let i = erros.length - 1; i >= 0; i -= 1) {
              if (isRoleOnlyError(erros[i])) erros.splice(i, 1);
            }
          }

          if (linkRecord && !braceletResolved) {
            for (let i = erros.length - 1; i >= 0; i -= 1) {
              if (isBraceletOnlyError(erros[i])) erros.splice(i, 1);
            }
          }

          const pendenteFuncao = erros.some(isRoleOnlyError) && !roleResolved;
          const pendentePulseira = erros.some(isBraceletOnlyError) && !braceletResolved;

          if (erros.length && (pendenteFuncao || pendentePulseira) && !erros.some((e) => !isRecoverableOnlyError(e))) {
            const vinculo = linkRecord ? "ja_vinculado" : "a_vincular";
            const row = {
              linha: line,
              cadastro: "erro",
              vinculo,
              chave: { documento: normalizedDocument, tipo: typeResolved.description },
              resolvido: {
                id_collaborator_document_type: typeResolved.id,
                ...(existing ? { id_collaborator: existing.id_collaborator } : {}),
                ...(roleResolved ? { id_collaborator_role: roleResolved.id } : {}),
                ...(braceletResolved ? { id_bracelet_type: braceletResolved.id } : {}),
              },
              divergencias: [],
              divergencias_vinculo: [],
              erros: [...erros],
              nome: incoming.nome_completo,
              pulseira: braceletResolved?.name || incoming.pulseira || null,
              pendente_funcao: pendenteFuncao,
              pendente_pulseira: pendentePulseira,
            };
            colaboradores.push(publicRow(row));
            sessionCollaborators.push({
              ...row,
              existingId: existing?.id_collaborator || null,
              roleId: roleResolved?.id || null,
              braceletId: braceletResolved?.id || null,
              validated: null,
              linkRecord,
            });
            continue;
          }
        }
      }

      if (erros.length && erros.some((e) => !isRecoverableOnlyError(e))) {
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
          pulseira: incoming.pulseira || null,
        };
        colaboradores.push(publicRow(row));
        sessionCollaborators.push({
          ...row,
          existingId: null,
          roleId: roleResolved?.id || null,
          braceletId: braceletResolved?.id || null,
          validated: null,
          linkRecord: null,
        });
        continue;
      }

      if (erros.length) {
        continue;
      }
    }

    if (typeResolved && !normalizedDocument) {
      const docResult = await validateDocumentByType(incoming.documento, typeResolved.id);
      if (docResult.error) {
        const row = {
          linha: line,
          cadastro: "erro",
          vinculo: "a_vincular",
          chave: { documento: incoming.documento, tipo: incoming.tipo_de_documento || null },
          resolvido: null,
          divergencias: [],
          divergencias_vinculo: [],
          erros: [docResult.error],
          nome: incoming.nome_completo || null,
          pulseira: incoming.pulseira || null,
        };
        colaboradores.push(publicRow(row));
        sessionCollaborators.push({
          ...row,
          existingId: null,
          roleId: roleResolved?.id || null,
          braceletId: braceletResolved?.id || null,
          validated: null,
          linkRecord: null,
        });
        continue;
      }
      normalizedDocument = docResult.value;
    }

    if (!existing && normalizedDocument && typeResolved) {
      existing = await findCollaboratorByDocType(normalizedDocument, typeResolved.id);
    }
    if (existing && !linkRecord) {
      linkRecord = await isCollaboratorLinked(accreditationCompanyId, existing.id_collaborator);
    }
    const vinculo = linkRecord ? "ja_vinculado" : "a_vincular";
    const pulseiraLabel = braceletResolved?.name || incoming.pulseira || null;

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
            ...(braceletResolved ? { id_bracelet_type: braceletResolved.id } : {}),
          },
          divergencias: [],
          divergencias_vinculo: [],
          erros: [validated.error],
          nome: incoming.nome_completo,
          pulseira: pulseiraLabel,
        };
        colaboradores.push(publicRow(row));
        sessionCollaborators.push({
          ...row,
          existingId: null,
          roleId: roleResolved.id,
          braceletId: braceletResolved?.id || null,
          validated: null,
          linkRecord: null,
        });
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
          ...(braceletResolved ? { id_bracelet_type: braceletResolved.id } : {}),
        },
        divergencias: [],
        divergencias_vinculo: [],
        erros: [],
        nome: validated.value.name,
        pulseira: pulseiraLabel,
      };
      colaboradores.push(publicRow(row));
      sessionCollaborators.push({
        ...row,
        existingId: null,
        roleId: roleResolved.id,
        braceletId: braceletResolved?.id || null,
        validated: validated.value,
        linkRecord: null,
      });
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
          ...(braceletResolved ? { id_bracelet_type: braceletResolved.id } : {}),
        },
        divergencias: [],
        divergencias_vinculo: buildRoleDivergences(),
        erros: ["Colaborador inativo."],
        nome: existing.name,
        pulseira: pulseiraLabel,
      };
      colaboradores.push(publicRow(row));
      sessionCollaborators.push({
        ...row,
        existingId: existing.id_collaborator,
        roleId: roleResolved.id,
        braceletId: braceletResolved?.id || null,
        validated: null,
        linkRecord,
      });
      continue;
    }

    const blocklist = await blocklistPolicy.getActiveBlock(existing.id_collaborator);
    if (blocklist) {
      const row = {
        linha: line,
        cadastro: "erro",
        vinculo,
        chave: { documento: existing.document, tipo: typeResolved.description },
        resolvido: {
          id_collaborator: existing.id_collaborator,
          id_collaborator_document_type: typeResolved.id,
          id_collaborator_role: roleResolved.id,
          ...(braceletResolved ? { id_bracelet_type: braceletResolved.id } : {}),
        },
        divergencias: [],
        divergencias_vinculo: buildRoleDivergences(),
        erros: [blocklistPolicy.formatNotice(blocklist)],
        nome: existing.name,
        pulseira: pulseiraLabel,
      };
      colaboradores.push(publicRow(row));
      sessionCollaborators.push({
        ...row,
        existingId: existing.id_collaborator,
        roleId: roleResolved.id,
        braceletId: braceletResolved?.id || null,
        validated: null,
        linkRecord,
      });
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
        ...(braceletResolved ? { id_bracelet_type: braceletResolved.id } : {}),
        ...(masterRoleId != null ? { id_collaborator_role_atual: Number(masterRoleId) } : {}),
      },
      divergencias: masterDiffs,
      divergencias_vinculo: buildRoleDivergences(),
      erros: [],
      nome: existing.name,
      pulseira: pulseiraLabel,
    };
    colaboradores.push(publicRow(row));
    sessionCollaborators.push({
      ...row,
      existingId: existing.id_collaborator,
      roleId: roleResolved.id,
      braceletId: braceletResolved?.id || null,
      masterRoleId,
      validated: {
        name: masterIncoming.name,
        rg: masterIncoming.rg,
        phone: masterIncoming.phone,
        id_collaborator_role: roleResolved.id,
      },
      linkRecord,
    });
  }

  if (!colaboradores.length) {
    throw new AppError(
      "Nenhuma linha válida para importar (apenas exemplo ou linhas vazias).",
      422,
    );
  }

  const previewToken = savePreviewSession({
    kind: KIND,
    accreditationId: Number(accreditationId),
    companyId: Number(companyId),
    accreditationCompanyId: Number(accreditationCompanyId),
    userId: userId || null,
    collaborators: sessionCollaborators,
    vehicles: [],
  });

  return {
    arquivo: file.originalname || "importacao.xlsx",
    previewToken,
    acesso: {
      id: Number(accreditationId),
      nome: eventName || `Credenciamento #${accreditationId}`,
      empresa: companyName || null,
    },
    resumo: {
      colaboradores: summarizeAxis(colaboradores),
      veiculos: summarizeAxis([]),
    },
    colaboradores,
    veiculos: [],
    updateFields: {
      colaboradorMaster: MASTER_UPDATE_FIELDS,
      colaboradorVinculo: ["id_collaborator_role"],
      veiculo: [],
    },
  };
}

async function confirmUnifiedBulkImport(ctx) {
  const {
    accreditationId,
    companyId,
    accreditationCompanyId,
    previewToken,
    decisoes,
    userId,
    allowedBraceletIds,
  } = ctx;

  const session = getPreviewSession(previewToken, KIND, {
    consumedCode: PREVIEW_TOKEN_CONSUMIDO,
  });
  if (
    Number(session.accreditationId) !== Number(accreditationId) ||
    Number(session.companyId) !== Number(companyId)
  ) {
    throw new AppError("Pré-visualização de outro credenciamento/empresa.", 400);
  }

  const colDecisions = Array.isArray(decisoes?.colaboradores) ? decisoes.colaboradores : [];
  const colByLine = new Map(session.collaborators.map((r) => [r.linha, r]));
  const allowed = new Set((allowedBraceletIds || []).map((id) => Number(id)));

  const result = {
    colaboradores: { inseridos: 0, atualizados: 0, vinculados: 0, ignorados: 0, erros: [] },
    veiculos: { inseridos: 0, atualizados: 0, vinculados: 0, ignorados: 0, erros: [] },
    motoristas: 0,
  };

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

    const correctedRoleId = Number(decision.id_collaborator_role);
    const roleCorrection =
      row.cadastro === "erro" &&
      row.pendente_funcao &&
      Number.isFinite(correctedRoleId) &&
      correctedRoleId > 0;

    const correctedBraceletId = Number(decision.id_bracelet_type);
    const braceletCorrection =
      row.cadastro === "erro" &&
      row.pendente_pulseira &&
      Number.isFinite(correctedBraceletId) &&
      correctedBraceletId > 0;

    if (row.cadastro === "erro") {
      if (row.pendente_funcao && !roleCorrection) {
        result.colaboradores.erros.push({
          linha: line,
          motivo: (row.erros && row.erros[0]) || "Função / Cargo pendente.",
        });
        continue;
      }
      if (row.pendente_pulseira && !braceletCorrection) {
        result.colaboradores.erros.push({
          linha: line,
          motivo: (row.erros && row.erros[0]) || "Pulseira pendente.",
        });
        continue;
      }
      if (!row.pendente_funcao && !row.pendente_pulseira) {
        result.colaboradores.erros.push({
          linha: line,
          motivo: (row.erros && row.erros[0]) || "Linha com erro.",
        });
        continue;
      }
    }

    try {
      let collaboratorId = row.existingId;
      if (roleCorrection && !collaboratorId) {
        const docTypeId = Number(row.resolvido?.id_collaborator_document_type);
        const document = String(row.chave?.documento || "").trim();
        const name = String(row.nome || "").trim();
        if (!docTypeId || !document || !name) {
          throw new AppError("Dados insuficientes para cadastrar com a função corrigida.", 400);
        }
        const [ins] = await db.execute(
          `INSERT INTO collaborator (
             id_collaborator_document_type, id_collaborator_role,
             document, name, rg, phone, status
           ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [docTypeId, correctedRoleId, document, name, null, null],
        );
        collaboratorId = ins.insertId;
        result.colaboradores.inseridos += 1;
      } else if (row.cadastro === "novo" || (row.cadastro === "erro" && row.pendente_pulseira && !collaboratorId)) {
        if (row.validated) {
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
          result.colaboradores.inseridos += 1;
        } else if (row.pendente_pulseira && !row.pendente_funcao) {
          const docTypeId = Number(row.resolvido?.id_collaborator_document_type);
          const roleId = Number(row.roleId || row.resolvido?.id_collaborator_role);
          const document = String(row.chave?.documento || "").trim();
          const name = String(row.nome || "").trim();
          if (!docTypeId || !roleId || !document || !name) {
            throw new AppError("Dados insuficientes para cadastrar com a pulseira corrigida.", 400);
          }
          const [ins] = await db.execute(
            `INSERT INTO collaborator (
               id_collaborator_document_type, id_collaborator_role,
               document, name, rg, phone, status
             ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [docTypeId, roleId, document, name, null, null],
          );
          collaboratorId = ins.insertId;
          result.colaboradores.inseridos += 1;
        } else if (row.cadastro === "novo") {
          throw new AppError("Cadastro novo sem dados validados.", 400);
        }
      } else if (row.existingId) {
        const masterFields = Array.isArray(decision.camposMaster) ? decision.camposMaster : [];
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
        if (roleCorrection) {
          await db.execute(
            `UPDATE collaborator SET id_collaborator_role = ? WHERE id_collaborator = ? AND (id_collaborator_role IS NULL OR id_collaborator_role = 0)`,
            [correctedRoleId, row.existingId],
          );
        }
      }

      if (!collaboratorId) {
        result.colaboradores.erros.push({ linha: line, motivo: "Sem ID de colaborador." });
        continue;
      }

      const applyRole = decision.aplicarFuncao === true || roleCorrection;
      const roleId = roleCorrection
        ? correctedRoleId
        : applyRole
          ? row.roleId
          : row.linkRecord?.id_collaborator_role || row.masterRoleId || row.roleId || null;
      if (!roleId) {
        result.colaboradores.erros.push({
          linha: line,
          motivo: "Função / Cargo obrigatória para indicar.",
        });
        continue;
      }

      const braceletId = braceletCorrection
        ? correctedBraceletId
        : row.braceletId || row.resolvido?.id_bracelet_type || row.linkRecord?.id_bracelet_type || null;

      if (typeof collaboratorService.linkCollaboratorToCompany === "function") {
        await collaboratorService.linkCollaboratorToCompany(collaboratorId, companyId);
      }

      if (row.vinculo === "ja_vinculado" || row.linkRecord) {
        continue;
      }

      if (!braceletId || !allowed.has(Number(braceletId))) {
        result.colaboradores.erros.push({
          linha: line,
          motivo: "Pulseira obrigatória e habilitada neste credenciamento.",
        });
        continue;
      }

      try {
        await db.execute(
          `INSERT INTO event_accreditation_collaborator
             (id_event_accreditation_company, id_collaborator, id_collaborator_role,
              id_bracelet_type, id_access_status)
           VALUES (?, ?, ?, ?, ?)`,
          [
            accreditationCompanyId,
            collaboratorId,
            roleId,
            braceletId,
            STATUS_AGUARDANDO_PRODUTORA,
          ],
        );
        result.colaboradores.vinculados += 1;
      } catch (err) {
        if (err && err.code === "ER_DUP_ENTRY") {
          continue;
        }
        throw err;
      }
    } catch (err) {
      result.colaboradores.erros.push({
        linha: line,
        motivo: err instanceof AppError ? err.message : "Erro ao aplicar colaborador.",
      });
    }
  }

  deletePreviewSession(previewToken);
  result.importedBy = userId || null;
  result.importedAt = new Date().toISOString();
  return result;
}

async function buildTemplate({ types, roles, bracelets }) {
  return buildEventAccreditationBulkTemplate({ types, roles, bracelets });
}

module.exports = {
  KIND,
  parseAccreditationWorkbook,
  resolveBracelet,
  previewUnifiedBulkImport,
  confirmUnifiedBulkImport,
  buildTemplate,
};
