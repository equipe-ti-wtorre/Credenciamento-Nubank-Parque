const AppError = require("../../utils/AppError");
const {
  parseUnifiedWorkbook,
  resolveByFoldedDescription,
  isExampleCollaboratorRow,
  mapRowByHeaders,
  normalizeCollabIncoming,
  loadLookups,
  summarizeAxis,
  findCollaboratorByDocType,
  buildUnifiedTemplate,
  MAX_ROWS,
} = require("../patrimonial/service-access-bulk-import");
const { validateDocumentByType, validateAndNormalizeCollaboratorPayload } = require("./collaborator.schema");
const { buildFieldDiffs, pickUpdatePatch } = require("../bulk/diff");
const {
  savePreviewSession,
  getPreviewSession,
  deletePreviewSession,
} = require("../bulk/previewSession");

const KIND = "collaborators_unified";
const MASTER_FIELDS = ["name", "rg", "phone"];

function isRoleOnlyError(msg) {
  return (
    msg === "Função / Cargo obrigatória." ||
    String(msg || "").startsWith("Função / Cargo fora da lista")
  );
}

function emptyVeiculosAxis() {
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

async function checkBlacklisted(collaboratorId) {
  const db = require("../../config/db");
  const [rows] = await db.execute(
    "SELECT 1 FROM collaborator_black_list WHERE id_collaborator = ? LIMIT 1",
    [collaboratorId],
  );
  return rows.length > 0;
}

function buildRoleDivergences(masterRoleId, masterRoleDesc, sheetRoleId, sheetRoleDesc) {
  if (
    masterRoleId == null ||
    sheetRoleId == null ||
    Number(masterRoleId) === Number(sheetRoleId)
  ) {
    return [];
  }
  return [
    {
      campo: "id_collaborator_role",
      rotulo: "Função / Cargo",
      atual: masterRoleDesc || "—",
      novo: sheetRoleDesc || "—",
    },
  ];
}

/**
 * Preview unificado (só aba Colaboradores) no contrato do wizard de acesso/evento.
 */
async function previewUnifiedCollaboratorsBulk(ctx) {
  const { file, userId, getActorCompanyId } = ctx;
  const { collaborators: rawCols } = parseUnifiedWorkbook(
    file.buffer,
    file.mimetype,
    file.originalname,
  );

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

    let normalizedDocument = null;

    if (erros.length) {
      const hasNonRoleErrors = erros.some((e) => !isRoleOnlyError(e));
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

          if (!roleResolved && existing?.id_collaborator_role) {
            roleResolved = {
              id: existing.id_collaborator_role,
              description: existing.role_description || null,
            };
            for (let i = erros.length - 1; i >= 0; i -= 1) {
              if (isRoleOnlyError(erros[i])) erros.splice(i, 1);
            }
          } else if (!roleResolved) {
            const row = {
              linha: line,
              cadastro: "erro",
              vinculo: "a_vincular",
              chave: { documento: normalizedDocument, tipo: typeResolved.description },
              resolvido: {
                id_collaborator_document_type: typeResolved.id,
                ...(existing ? { id_collaborator: existing.id_collaborator } : {}),
              },
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
            });
            continue;
          } else {
            for (let i = erros.length - 1; i >= 0; i -= 1) {
              if (isRoleOnlyError(erros[i])) erros.splice(i, 1);
            }
          }
        } else {
          erros.push(docResult.error);
        }
      }

      if (erros.length) {
        const row = {
          linha: line,
          cadastro: "erro",
          vinculo: "a_vincular",
          chave: {
            documento: incoming.documento,
            tipo: incoming.tipo_de_documento || null,
          },
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
        });
        continue;
      }
    }

    if (typeResolved) {
      const docResult = await validateDocumentByType(incoming.documento, typeResolved.id);
      if (docResult.error) {
        const row = {
          linha: line,
          cadastro: "erro",
          vinculo: "a_vincular",
          chave: { documento: incoming.documento, tipo: typeResolved.description },
          resolvido: null,
          divergencias: [],
          divergencias_vinculo: [],
          erros: [docResult.error],
          nome: incoming.nome_completo || null,
        };
        colaboradores.push(row);
        sessionCollaborators.push({
          ...row,
          existingId: null,
          roleId: roleResolved?.id || null,
          validated: null,
        });
        continue;
      }
      normalizedDocument = docResult.value;
    }

    const validated = await validateAndNormalizeCollaboratorPayload({
      document: normalizedDocument || incoming.documento,
      id_collaborator_document_type: typeResolved.id,
      name: incoming.nome_completo,
      id_collaborator_role: roleResolved.id,
      rg: incoming.rg,
      phone: incoming.telefone,
    });

    if (validated.error) {
      const row = {
        linha: line,
        cadastro: "erro",
        vinculo: "a_vincular",
        chave: {
          documento: normalizedDocument || incoming.documento,
          tipo: typeResolved.description,
        },
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
      });
      continue;
    }

    const existing = await findCollaboratorByDocType(
      validated.value.document,
      validated.value.id_collaborator_document_type,
    );

    if (!existing) {
      const row = {
        linha: line,
        cadastro: "novo",
        vinculo: "a_vincular",
        chave: {
          documento: validated.value.document,
          tipo: typeResolved.description,
        },
        resolvido: {
          id_collaborator_document_type: validated.value.id_collaborator_document_type,
          id_collaborator_role: validated.value.id_collaborator_role,
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
        roleId: validated.value.id_collaborator_role,
        validated: validated.value,
      });
      continue;
    }

    if (!existing.status) {
      const row = {
        linha: line,
        cadastro: "erro",
        vinculo: "a_vincular",
        chave: {
          documento: existing.document,
          tipo: typeResolved.description,
        },
        resolvido: { id_collaborator: existing.id_collaborator },
        divergencias: [],
        divergencias_vinculo: [],
        erros: ["Colaborador inativo."],
        nome: existing.name,
      };
      colaboradores.push(row);
      sessionCollaborators.push({
        ...row,
        existingId: existing.id_collaborator,
        roleId: roleResolved.id,
        validated: null,
      });
      continue;
    }

    if (await checkBlacklisted(existing.id_collaborator)) {
      const row = {
        linha: line,
        cadastro: "erro",
        vinculo: "a_vincular",
        chave: {
          documento: existing.document,
          tipo: typeResolved.description,
        },
        resolvido: { id_collaborator: existing.id_collaborator },
        divergencias: [],
        divergencias_vinculo: [],
        erros: ["Colaborador consta na lista de bloqueio."],
        nome: existing.name,
      };
      colaboradores.push(row);
      sessionCollaborators.push({
        ...row,
        existingId: existing.id_collaborator,
        roleId: roleResolved.id,
        validated: null,
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
    const masterDiffs = buildFieldDiffs(masterExisting, masterIncoming, MASTER_FIELDS).map((d) => ({
      campo: d.field,
      rotulo: d.field === "name" ? "Nome completo" : d.field === "rg" ? "RG" : "Telefone",
      atual: d.current,
      novo: d.incoming,
    }));

    const masterRoleId = existing.id_collaborator_role || null;
    const divergencias_vinculo = buildRoleDivergences(
      masterRoleId,
      existing.role_description,
      roleResolved.id,
      roleResolved.description,
    );

    const cadastro = masterDiffs.length || divergencias_vinculo.length ? "atualizacao" : "inalterado";
    const companyId = typeof getActorCompanyId === "function" ? getActorCompanyId() : null;
    const vinculo = companyId != null ? "a_vincular" : "ja_vinculado";

    const row = {
      linha: line,
      cadastro,
      vinculo,
      chave: {
        documento: existing.document,
        tipo: typeResolved.description,
      },
      resolvido: {
        id_collaborator: existing.id_collaborator,
        id_collaborator_document_type: typeResolved.id,
        id_collaborator_role: roleResolved.id,
        ...(masterRoleId != null ? { id_collaborator_role_atual: Number(masterRoleId) } : {}),
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
    });
  }

  if (!colaboradores.length) {
    throw new AppError("Nenhuma linha de dados válida na aba Colaboradores.", 422);
  }

  const previewToken = savePreviewSession({
    kind: KIND,
    userId: userId || null,
    collaborators: sessionCollaborators,
  });

  return {
    arquivo: file.originalname || "planilha.xlsx",
    previewToken,
    acesso: { id: 0, nome: "Cadastro de colaboradores", empresa: null },
    resumo: {
      colaboradores: summarizeAxis(colaboradores),
      veiculos: emptyVeiculosAxis(),
    },
    colaboradores,
    veiculos: [],
    updateFields: {
      colaboradorMaster: MASTER_FIELDS,
      colaboradorVinculo: ["id_collaborator_role"],
      veiculo: [],
    },
  };
}

async function confirmUnifiedCollaboratorsBulk(ctx) {
  const {
    req,
    previewToken,
    decisoes,
    insertCollaboratorRecord,
    linkCollaboratorToCompany,
    updateCollaborator,
    getActorCompanyId,
    hasPermission,
  } = ctx;

  const session = getPreviewSession(previewToken, KIND);
  if (session.userId && req.user?.id && Number(session.userId) !== Number(req.user.id)) {
    throw new AppError("Pré-visualização pertence a outro usuário.", 403);
  }

  const colDecisions = Array.isArray(decisoes?.colaboradores) ? decisoes.colaboradores : [];
  const colByLine = new Map(session.collaborators.map((r) => [r.linha, r]));

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

  const companyId = getActorCompanyId(req);

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

    if (row.cadastro === "erro" && !roleCorrection) {
      result.colaboradores.erros.push({
        linha: line,
        motivo: (row.erros && row.erros[0]) || "Linha com erro.",
      });
      continue;
    }

    try {
      let collaboratorId = row.existingId;

      if (roleCorrection && !collaboratorId) {
        if (!hasPermission(req.user, "collaborators", "create")) {
          throw new AppError("Sem permissão para criar.", 403);
        }
        const docTypeId = Number(row.resolvido?.id_collaborator_document_type);
        const document = String(row.chave?.documento || "").trim();
        const name = String(row.nome || "").trim();
        if (!docTypeId || !document || !name) {
          throw new AppError("Dados insuficientes para cadastrar com a função corrigida.", 400);
        }
        const created = await insertCollaboratorRecord({
          id_collaborator_document_type: docTypeId,
          id_collaborator_role: correctedRoleId,
          document,
          name,
          rg: null,
          phone: null,
          status: true,
        });
        collaboratorId = created.id_collaborator;
        if (companyId != null) {
          await linkCollaboratorToCompany(collaboratorId, companyId);
        }
        result.colaboradores.inseridos += 1;
      } else if (row.cadastro === "novo") {
        if (!row.validated) throw new AppError("Cadastro novo sem dados validados.", 400);
        if (!hasPermission(req.user, "collaborators", "create")) {
          throw new AppError("Sem permissão para criar.", 403);
        }
        const created = await insertCollaboratorRecord({ ...row.validated, status: true });
        collaboratorId = created.id_collaborator;
        if (companyId != null) {
          await linkCollaboratorToCompany(collaboratorId, companyId);
        }
        result.colaboradores.inseridos += 1;
      } else if (row.existingId) {
        let didUpdate = false;
        if (companyId != null) {
          await linkCollaboratorToCompany(row.existingId, companyId);
          if (row.cadastro === "inalterado") {
            result.colaboradores.vinculados += 1;
          }
        }

        const masterFields = Array.isArray(decision.camposMaster) ? decision.camposMaster : [];
        const patch =
          masterFields.length && row.validated
            ? pickUpdatePatch(row.validated, masterFields, MASTER_FIELDS)
            : {};
        const applyRole = decision.aplicarFuncao === true || roleCorrection;
        const roleId = roleCorrection
          ? correctedRoleId
          : applyRole
            ? row.roleId
            : null;

        if ((Object.keys(patch).length || roleId) && !hasPermission(req.user, "collaborators", "edit")) {
          throw new AppError("Sem permissão para editar.", 403);
        }

        if (Object.keys(patch).length) {
          await updateCollaborator(req, row.existingId, {
            ...patch,
            ...(roleId ? { id_collaborator_role: roleId } : {}),
          });
          didUpdate = true;
        } else if (roleId) {
          await updateCollaborator(req, row.existingId, { id_collaborator_role: roleId });
          didUpdate = true;
        }

        if (didUpdate) result.colaboradores.atualizados += 1;
        collaboratorId = row.existingId;
      }

      if (!collaboratorId) {
        result.colaboradores.erros.push({ linha: line, motivo: "Sem ID de colaborador." });
      }
    } catch (err) {
      result.colaboradores.erros.push({
        linha: line,
        motivo: err instanceof AppError ? err.message : "Erro ao aplicar colaborador.",
      });
    }
  }

  deletePreviewSession(previewToken);
  return result;
}

module.exports = {
  KIND,
  buildUnifiedTemplate,
  previewUnifiedCollaboratorsBulk,
  confirmUnifiedCollaboratorsBulk,
};
