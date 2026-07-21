const crypto = require("crypto");
const db = require("../../config/db");
const env = require("../../config/env");
const { child } = require("../../config/logger");
const AppError = require("../../utils/AppError");
const collaboratorService = require("../collaborators/collaborator.service");
const companyService = require("../companies/company.service");
const teamsService = require("../teams/teams.service");
const smtpService = require("../smtp/smtp.service");
const alertsService = require("../alerts/alerts.service");
const { parseBulkFile } = require("../collaborators/collaborator.bulk");
const {
  savePreviewSession,
  getPreviewSession,
  deletePreviewSession,
} = require("../bulk/previewSession");
const {
  STATUS_AGUARDANDO_PRODUTORA,
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_APROVADO,
  STATUS_NEGADO,
} = require("./credentials.schema");
const { getProfileCodigo, isSuperAdmin, hasPermission } = require("../../utils/permissions");

const logger = child({ module: "credentials" });

const TYPE_PRODUTORA = "Produtora";
const TYPE_EMPRESA_PADRAO = "Empresa Padrão";
const PAPEIS_CAN_APPROVE = ["APROVADOR", "GESTOR"];

let cachedProdutoraTypeId = null;
let cachedEmpresaPadraoTypeId = null;

const CREDENTIAL_SELECT = `
  SELECT edcc.*,
         ast.description AS access_status_description,
         c.id_collaborator, c.name AS collaborator_name, c.document AS collaborator_document,
         cr.description AS role_description,
         edc.id_event_day_company, edc.id_company, edc.id_producer,
         ed.id_event_day, ed.date AS event_day_date,
         e.id_event, e.name AS event_name, e.id_access_status AS event_access_status,
         e.id_company_responsavel, e.ativo AS event_ativo,
         co.company_name, co.fancy_name AS company_fancy_name
  FROM event_day_company_collaborator edcc
  INNER JOIN access_status ast ON ast.id_access_status = edcc.id_access_status
  INNER JOIN collaborator c ON c.id_collaborator = edcc.id_collaborator
  INNER JOIN collaborator_role cr ON cr.id_collaborator_role = edcc.id_collaborator_role
  INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
  INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
  INNER JOIN event e ON e.id_event = ed.id_event
  INNER JOIN company co ON co.id_company = edc.id_company
`;

async function getProdutoraTypeId() {
  if (cachedProdutoraTypeId != null) return cachedProdutoraTypeId;
  const [rows] = await db.execute(
    "SELECT id_company_type FROM company_type WHERE description = ? LIMIT 1",
    [TYPE_PRODUTORA],
  );
  if (rows.length === 0) {
    throw new AppError("Tipo de empresa 'Produtora' não configurado.", 500);
  }
  cachedProdutoraTypeId = rows[0].id_company_type;
  return cachedProdutoraTypeId;
}

async function getEmpresaPadraoTypeId() {
  if (cachedEmpresaPadraoTypeId != null) return cachedEmpresaPadraoTypeId;
  const [rows] = await db.execute(
    "SELECT id_company_type FROM company_type WHERE description = ? LIMIT 1",
    [TYPE_EMPRESA_PADRAO],
  );
  if (rows.length === 0) {
    throw new AppError("Tipo de empresa 'Empresa Padrão' não configurado.", 500);
  }
  cachedEmpresaPadraoTypeId = rows[0].id_company_type;
  return cachedEmpresaPadraoTypeId;
}

function getUserRole(req) {
  return getProfileCodigo(req.user);
}

function isCompanyScopedRole(role) {
  return (
    role === "PADRAO" ||
    role === "EMPRESA_GESTOR" ||
    role === "EMPRESA_SOLICITANTE"
  );
}

async function isUserCompanyProdutora(idCompany) {
  if (idCompany == null) return false;
  const company = await companyService.findActiveCompanyById(idCompany);
  if (!company) return false;
  const produtoraTypeId = await getProdutoraTypeId();
  return Number(company.id_company_type) === Number(produtoraTypeId);
}

/**
 * Escopo de listagem/operação de credenciais.
 * Empresa tipo Produtora (responsável) → mode "produtora" mesmo com perfil EMPRESA_*,
 * para ver colaboradores das parceiras (id_producer / id_company_responsavel).
 */
async function buildCredentialScope(req) {
  const role = getUserRole(req);
  const idCompany =
    req.user?.id_company != null ? Number(req.user.id_company) : null;

  if (isSuperAdmin(req.user)) {
    return { mode: "admin" };
  }

  if (role === "PRODUTORA") {
    if (!idCompany) {
      throw new AppError("Usuário produtora sem empresa vinculada.", 403);
    }
    return { mode: "produtora", companyId: idCompany };
  }

  if (isCompanyScopedRole(role) || !!req.user?.requires_company) {
    if (!idCompany) {
      throw new AppError("Usuário sem empresa vinculada.", 403);
    }
    if (await isUserCompanyProdutora(idCompany)) {
      return { mode: "produtora", companyId: idCompany };
    }
    return { mode: "padrao", companyId: idCompany };
  }

  if (hasPermission(req.user, "approvals", "view") && req.user?.id) {
    return { mode: "sector_approver", userId: Number(req.user.id) };
  }
  throw new AppError("Perfil sem permissão para credenciamento.", 403);
}

function applyScopeToWhere(scope) {
  const conditions = [];
  const params = [];

  if (scope.mode === "admin") {
    return { conditions, params };
  }
  if (scope.mode === "padrao") {
    conditions.push("edc.id_company = ?");
    params.push(scope.companyId);
    return { conditions, params };
  }
  if (scope.mode === "produtora") {
    conditions.push(
      "(edc.id_company = ? OR edc.id_producer = ? OR e.id_company_responsavel = ?)",
    );
    params.push(scope.companyId, scope.companyId, scope.companyId);
    return { conditions, params };
  }
  if (scope.mode === "sector_approver") {
    conditions.push(`EXISTS (
      SELECT 1 FROM aprovacoes a
      INNER JOIN setor_usuarios su
        ON su.id_setor = a.id_setor
       AND su.id_usuario = ?
       AND su.ativo = 1
       AND su.papel IN (${PAPEIS_CAN_APPROVE.map(() => "?").join(",")})
      WHERE a.tipo_entidade = 'EVENTO' AND a.id_entidade = e.id_event
    )`);
    params.push(scope.userId, ...PAPEIS_CAN_APPROVE);
    return { conditions, params };
  }
  return { conditions, params };
}

async function userCanFinalApproveCredential(user, idEvent) {
  if (isSuperAdmin(user)) return true;
  if (!user?.id || !idEvent) return false;
  const [rows] = await db.execute(
    `SELECT 1
       FROM aprovacoes a
       INNER JOIN setor_usuarios su
         ON su.id_setor = a.id_setor
        AND su.id_usuario = ?
        AND su.ativo = 1
        AND su.papel IN (${PAPEIS_CAN_APPROVE.map(() => "?").join(",")})
      WHERE a.tipo_entidade = 'EVENTO' AND a.id_entidade = ?
      ORDER BY a.id DESC
      LIMIT 1`,
    [user.id, ...PAPEIS_CAN_APPROVE, idEvent],
  );
  return rows.length > 0;
}

async function assertCanWriteStatus(req) {
  const role = getUserRole(req);
  if (role === "PADRAO") {
    throw new AppError("Perfil sem permissão para alterar status de credencial.", 403);
  }
  if (
    role === "ADMIN" ||
    role === "PRODUTORA" ||
    hasPermission(req.user, "approvals", "view")
  ) {
    return;
  }
  const idCompany =
    req.user?.id_company != null ? Number(req.user.id_company) : null;
  // Gestor/solicitante da empresa Produtora (responsável) pode avançar status.
  if (
    (role === "EMPRESA_GESTOR" || role === "EMPRESA_SOLICITANTE") &&
    (await isUserCompanyProdutora(idCompany))
  ) {
    return;
  }
  throw new AppError("Perfil sem permissão para alterar status de credencial.", 403);
}

function assertCanCreate(req) {
  const role = getUserRole(req);
  if (
    role === "ADMIN" ||
    role === "PRODUTORA" ||
    isCompanyScopedRole(role) ||
    (!!req.user?.requires_company && hasPermission(req.user, "events", "edit"))
  ) {
    return;
  }
  throw new AppError("Perfil sem permissão para solicitar credencial.", 403);
}

function mapCredentialRow(row) {
  return {
    id_event_day_company_collaborator: row.id_event_day_company_collaborator,
    id_event_day_company: row.id_event_day_company,
    id_collaborator: row.id_collaborator,
    id_access_status: row.id_access_status,
    access_status_description: row.access_status_description,
    id_collaborator_role: row.id_collaborator_role,
    role_description: row.role_description,
    access_id: row.access_id || null,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    collaborator: {
      id_collaborator: row.id_collaborator,
      name: row.collaborator_name,
      document: row.collaborator_document,
    },
    event_day_company: {
      id_event_day_company: row.id_event_day_company,
      id_company: row.id_company,
      id_producer: row.id_producer,
      company_name: row.company_name,
      company_fancy_name: row.company_fancy_name,
    },
    event_day: {
      id_event_day: row.id_event_day,
      date: row.event_day_date,
    },
    event: {
      id_event: row.id_event,
      name: row.event_name,
    },
  };
}

function parseListQuery(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit };
}

function parseListFilters(query) {
  const filters = {};
  if (query.id_event != null && query.id_event !== "") {
    filters.id_event = parseInt(query.id_event, 10);
  }
  if (query.id_event_day != null && query.id_event_day !== "") {
    filters.id_event_day = parseInt(query.id_event_day, 10);
  }
  if (query.id_event_day_company != null && query.id_event_day_company !== "") {
    filters.id_event_day_company = parseInt(query.id_event_day_company, 10);
  }
  if (query.id_access_status != null && query.id_access_status !== "") {
    filters.id_access_status = parseInt(query.id_access_status, 10);
  }
  return filters;
}

async function findEventDayCompanyById(id) {
  const [rows] = await db.execute(
    `SELECT edc.*, ed.id_event_day, ed.id_event, ed.date,
            e.id_company_responsavel, e.ativo AS event_ativo,
            c.company_name, c.id_company_type, ct.description AS company_type_description
     FROM event_day_company edc
     INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
     INNER JOIN event e ON e.id_event = ed.id_event
     INNER JOIN company c ON c.id_company = edc.id_company
     INNER JOIN company_type ct ON ct.id_company_type = c.id_company_type
     WHERE edc.id_event_day_company = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

function assertLinkedEventActive(linkRow) {
  if (linkRow && linkRow.event_ativo != null && !Number(linkRow.event_ativo)) {
    throw new AppError("Evento desativado. Reative-o para continuar.", 403);
  }
}

async function assertCanOperateOnLink(req, linkRow) {
  const scope = await buildCredentialScope(req);
  if (scope.mode === "admin") return;

  const companyId = Number(linkRow.id_company);
  const producerId =
    linkRow.id_producer != null ? Number(linkRow.id_producer) : null;
  const responsavelId =
    linkRow.id_company_responsavel != null
      ? Number(linkRow.id_company_responsavel)
      : null;

  if (scope.mode === "padrao") {
    if (companyId !== scope.companyId) {
      throw new AppError("Vínculo dia-empresa não encontrado.", 404);
    }
    return;
  }

  if (scope.mode === "produtora") {
    if (
      companyId === scope.companyId ||
      producerId === scope.companyId ||
      responsavelId === scope.companyId
    ) {
      return;
    }
    throw new AppError("Vínculo dia-empresa não encontrado.", 404);
  }
}

async function assertCredentialInScope(req, row) {
  const scope = await buildCredentialScope(req);
  if (scope.mode === "admin") return;

  const companyId = Number(row.id_company);
  const producerId = row.id_producer != null ? Number(row.id_producer) : null;
  const responsavelId =
    row.id_company_responsavel != null ? Number(row.id_company_responsavel) : null;

  if (scope.mode === "padrao") {
    if (companyId !== scope.companyId) {
      throw new AppError("Credencial não encontrada.", 404);
    }
    return;
  }

  if (scope.mode === "produtora") {
    if (
      companyId === scope.companyId ||
      producerId === scope.companyId ||
      responsavelId === scope.companyId
    ) {
      return;
    }
    throw new AppError("Credencial não encontrada.", 404);
  }

  if (scope.mode === "sector_approver") {
    // Validação fina em get/update via userCanFinalApproveCredential
    return;
  }
}

async function assertCredentialReadable(req, row) {
  const scope = await buildCredentialScope(req);
  if (scope.mode === "admin") return;
  if (scope.mode === "sector_approver") {
    const ok = await userCanFinalApproveCredential(req.user, row.id_event);
    if (!ok) throw new AppError("Credencial não encontrada.", 404);
    return;
  }
  await assertCredentialInScope(req, row);
}

async function assertNoDuplicateOnEventDay(idCollaborator, idEventDay, excludeId = null) {
  let sql = `
    SELECT edcc.id_event_day_company_collaborator
    FROM event_day_company_collaborator edcc
    INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
    WHERE edcc.id_collaborator = ? AND edc.id_event_day = ?
  `;
  const params = [idCollaborator, idEventDay];
  if (excludeId != null) {
    sql += " AND edcc.id_event_day_company_collaborator <> ?";
    params.push(excludeId);
  }
  sql += " LIMIT 1";
  const [rows] = await db.execute(sql, params);
  if (rows.length > 0) {
    throw new AppError(
      "Colaborador já possui credencial solicitada para este dia do evento.",
      409,
    );
  }
}

async function resolveInitialStatus(req) {
  const role = getUserRole(req);
  if (role === "ADMIN") {
    return STATUS_AGUARDANDO_APROVACAO;
  }

  const idCompany = req.user?.id_company;
  if (!idCompany) {
    throw new AppError("Usuário sem empresa vinculada.", 403);
  }

  const company = await companyService.findActiveCompanyById(idCompany);
  if (!company) {
    throw new AppError("Empresa do usuário não encontrada ou inativa.", 403);
  }

  const padraoTypeId = await getEmpresaPadraoTypeId();
  if (Number(company.id_company_type) === padraoTypeId) {
    return STATUS_AGUARDANDO_PRODUTORA;
  }

  const produtoraTypeId = await getProdutoraTypeId();
  if (Number(company.id_company_type) === produtoraTypeId) {
    return STATUS_AGUARDANDO_APROVACAO;
  }

  throw new AppError("Tipo de empresa do usuário não permite solicitar credencial.", 403);
}

async function findCredentialById(id) {
  const [rows] = await db.execute(
    `${CREDENTIAL_SELECT} WHERE edcc.id_event_day_company_collaborator = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function getCredentialById(req, id) {
  const row = await findCredentialById(id);
  if (!row) throw new AppError("Credencial não encontrada.", 404);
  await assertCredentialReadable(req, row);
  return mapCredentialRow(row);
}

async function listCredentials(req, { page, limit, filters }) {
  const scope = await buildCredentialScope(req);
  const { conditions, params } = applyScopeToWhere(scope);

  if (filters.id_event) {
    conditions.push("e.id_event = ?");
    params.push(filters.id_event);
  }
  if (filters.id_event_day) {
    conditions.push("ed.id_event_day = ?");
    params.push(filters.id_event_day);
  }
  if (filters.id_event_day_company) {
    conditions.push("edc.id_event_day_company = ?");
    params.push(filters.id_event_day_company);
  }
  if (filters.id_access_status) {
    conditions.push("edcc.id_access_status = ?");
    params.push(filters.id_access_status);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM event_day_company_collaborator edcc
     INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
     INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
     INNER JOIN event e ON e.id_event = ed.id_event
     ${whereClause}`,
    params,
  );
  const total = countRows[0].total;
  const offset = (page - 1) * limit;

  const [rows] = await db.execute(
    `${CREDENTIAL_SELECT}
     ${whereClause}
     ORDER BY edcc.criado_em DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return {
    credentials: rows.map(mapCredentialRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
    },
  };
}

async function createCredential(req, data) {
  assertCanCreate(req);

  const isBlacklisted = await collaboratorService.checkBlacklist(data.id_collaborator);
  if (isBlacklisted) {
    throw new AppError("Colaborador está na lista de restrição e não pode ser credenciado.", 403);
  }

  const collaborator = await collaboratorService.findCollaboratorById(data.id_collaborator);
  if (!collaborator) {
    throw new AppError("Colaborador não encontrado.", 404);
  }
  if (!collaborator.status) {
    throw new AppError("Colaborador inativo.", 400);
  }

  const link = await findEventDayCompanyById(data.id_event_day_company);
  if (!link) {
    throw new AppError("Vínculo dia-empresa não encontrado.", 404);
  }
  assertLinkedEventActive(link);
  await assertCanOperateOnLink(req, link);

  await assertNoDuplicateOnEventDay(data.id_collaborator, link.id_event_day);

  const idRole = data.id_collaborator_role ?? collaborator.id_collaborator_role;
  const [roleRows] = await db.execute(
    "SELECT 1 FROM collaborator_role WHERE id_collaborator_role = ? LIMIT 1",
    [idRole],
  );
  if (roleRows.length === 0) {
    throw new AppError("Função de colaborador inválida.", 400);
  }

  const initialStatus = await resolveInitialStatus(req);

  const [result] = await db.execute(
    `INSERT INTO event_day_company_collaborator (
       id_event_day_company, id_collaborator, id_access_status, id_collaborator_role
     ) VALUES (?, ?, ?, ?)`,
    [data.id_event_day_company, data.id_collaborator, initialStatus, idRole],
  );

  if (link.id_company != null) {
    await collaboratorService.linkCollaboratorToCompany(
      data.id_collaborator,
      link.id_company,
    );
  }

  const credential = await getCredentialById(req, result.insertId);

  if (initialStatus === STATUS_AGUARDANDO_APROVACAO) {
    scheduleTeamsNotification(credential);
  }

  return credential;
}

function validateStatusTransition(req, row, targetStatus) {
  const role = getUserRole(req);
  const current = Number(row.id_access_status);
  const userCompany =
    req.user?.id_company != null ? Number(req.user.id_company) : null;
  const producerId = row.id_producer != null ? Number(row.id_producer) : null;
  const responsavelId =
    row.id_company_responsavel != null ? Number(row.id_company_responsavel) : null;

  const canActAsProdutora =
    (producerId != null && producerId === userCompany) ||
    (responsavelId != null && responsavelId === userCompany);

  if (current === STATUS_AGUARDANDO_PRODUTORA && canActAsProdutora) {
    if (
      role !== "PRODUTORA" &&
      role !== "EMPRESA_GESTOR" &&
      role !== "EMPRESA_SOLICITANTE" &&
      role !== "ADMIN"
    ) {
      throw new AppError("Perfil sem permissão para alterar status de credencial.", 403);
    }
    if (
      targetStatus !== STATUS_AGUARDANDO_APROVACAO &&
      targetStatus !== STATUS_NEGADO
    ) {
      throw new AppError("Transição de status inválida para produtora.", 400);
    }
    return { kind: "produtora" };
  }

  return { kind: "final" };
}

async function assertFinalApprovalAllowed(req, row, targetStatus) {
  if (targetStatus !== STATUS_APROVADO && targetStatus !== STATUS_NEGADO) {
    throw new AppError("Transição de status inválida para aprovação final.", 400);
  }

  const current = Number(row.id_access_status);
  if (current !== STATUS_AGUARDANDO_APROVACAO) {
    throw new AppError("Credencial não está aguardando aprovação.", 400);
  }

  const canApprove =
    isSuperAdmin(req.user) ||
    (await userCanFinalApproveCredential(req.user, row.id_event));
  if (!canApprove) {
    throw new AppError("Perfil sem permissão para aprovar esta credencial.", 403);
  }

  if (targetStatus === STATUS_APROVADO) {
    const isBlacklisted = await collaboratorService.checkBlacklist(row.id_collaborator);
    if (isBlacklisted) {
      throw new AppError(
        "Colaborador está na lista de restrição e não pode ser aprovado.",
        403,
      );
    }
    if (row.id_substitute) {
      const substituteBlacklisted = await collaboratorService.checkBlacklist(
        row.id_substitute,
      );
      if (substituteBlacklisted) {
        throw new AppError(
          "Substituto está na lista de restrição e a credencial não pode ser aprovada.",
          403,
        );
      }
    }

    const eventStatus = Number(row.event_access_status);
    if (eventStatus !== STATUS_APROVADO) {
      throw new AppError(
        "O evento precisa estar aprovado antes de aprovar acessos de colaboradores.",
        409,
      );
    }
  }
}

async function resolveCompanyContactEmail(idCompany) {
  const [rows] = await db.execute(
    `SELECT email FROM company_contact
     WHERE id_company = ? AND email IS NOT NULL AND TRIM(email) <> ''
     ORDER BY id_company_contact ASC LIMIT 1`,
    [idCompany],
  );
  return rows[0]?.email?.trim() || null;
}

function scheduleTeamsNotification(credential) {
  const msg = [
    `<b>Nova credencial aguardando validação — ${env.organizationName}</b>`,
    `<p>Evento: ${credential.event.name}</p>`,
    `<p>Dia: ${credential.event_day.date}</p>`,
    `<p>Empresa: ${credential.event_day_company.company_name}</p>`,
    `<p>Colaborador: ${credential.collaborator.name}</p>`,
    `<p>ID credencial: ${credential.id_event_day_company_collaborator}</p>`,
  ].join("");

  const alertMensagem = [
    `Credencial #${credential.id_event_day_company_collaborator} aguardando validação.`,
    `Evento: ${credential.event.name}.`,
    `Colaborador: ${credential.collaborator.name}.`,
    `Empresa: ${credential.event_day_company.company_name}.`,
  ].join(" ");

  const eventId = credential.event?.id_event || null;
  const link = eventId ? `/admin/eventos/${eventId}` : "/admin/eventos";

  setImmediate(() => {
    teamsService
      .notifyOperationsChannel(msg)
      .then((r) => {
        if (!r.ok) {
          logger.warn({ message: r.message }, "Falha ao notificar Teams (credenciamento)");
        }
      })
      .catch((err) => {
        logger.warn({ err }, "Erro ao notificar Teams (credenciamento)");
      });

    alertsService
      .listUsersWithPermission("events", "edit")
      .then((userIds) =>
        alertsService.createAlertsForUsers(userIds, {
          tipo: "credentials.awaiting_admin",
          titulo: "Credencial aguardando validação",
          mensagem: alertMensagem,
          link,
          tipoReferencia: "credential",
          idReferencia: credential.id_event_day_company_collaborator,
        }),
      )
      .catch((err) => {
        logger.warn({ err }, "Erro ao criar alertas in-app (credenciamento)");
      });
  });
}

function scheduleApprovalEmail(credential, { usuarioId, requestId }) {
  setImmediate(async () => {
    try {
      const to = await resolveCompanyContactEmail(credential.event_day_company.id_company);
      if (!to) {
        logger.warn(
          { id_company: credential.event_day_company.id_company },
          "Sem e-mail em company_contact para credencial aprovada",
        );
        return;
      }

      const html = [
        "<h2>Credencial aprovada</h2>",
        `<p>Evento: <strong>${credential.event.name}</strong></p>`,
        `<p>Dia: ${credential.event_day.date}</p>`,
        `<p>Colaborador: ${credential.collaborator.name}</p>`,
        `<p>Código de acesso (QR): <strong>${credential.access_id}</strong></p>`,
      ].join("");

      await smtpService.sendMail({
        to,
        subject: `Credencial aprovada — ${credential.event.name}`,
        html,
        usuarioId,
        requestId,
      });
    } catch (err) {
      logger.warn({ err }, "Erro ao enviar e-mail de credencial aprovada");
    }
  });
}

async function updateCredentialStatus(req, id, { id_access_status: targetStatus, reason }) {
  await assertCanWriteStatus(req);

  const row = await findCredentialById(id);
  if (!row) throw new AppError("Credencial não encontrada.", 404);
  assertLinkedEventActive(row);
  await assertCredentialReadable(req, row);

  const transition = validateStatusTransition(req, row, targetStatus);
  if (transition.kind === "final") {
    await assertFinalApprovalAllowed(req, row, targetStatus);
  }

  const previousStatus = Number(row.id_access_status);
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    let accessId = row.access_id;

    if (targetStatus === STATUS_APROVADO) {
      accessId = crypto.randomUUID();
      await conn.execute(
        `UPDATE event_day_company_collaborator
         SET id_access_status = ?, access_id = ?
         WHERE id_event_day_company_collaborator = ?`,
        [targetStatus, accessId, id],
      );
    } else {
      await conn.execute(
        `UPDATE event_day_company_collaborator
         SET id_access_status = ?
         WHERE id_event_day_company_collaborator = ?`,
        [targetStatus, id],
      );
    }

    if (targetStatus === STATUS_NEGADO) {
      await conn.execute(
        `INSERT INTO event_day_company_collaborator_denied (
           id_event_day_company_collaborator, id_access_status, reason
         ) VALUES (?, ?, ?)`,
        [id, previousStatus, reason],
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const credential = await getCredentialById(req, id);

  if (targetStatus === STATUS_AGUARDANDO_APROVACAO) {
    scheduleTeamsNotification(credential);
  }
  if (targetStatus === STATUS_APROVADO) {
    scheduleApprovalEmail(credential, {
      usuarioId: req.user?.id,
      requestId: req.requestId,
    });
  }

  return {
    credential,
    auditChanges: {
      from: previousStatus,
      to: targetStatus,
      reason: targetStatus === STATUS_NEGADO ? reason : undefined,
    },
  };
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeEventCredBulkRow(raw) {
  const mapped = {};
  for (const [key, value] of Object.entries(raw || {})) {
    mapped[String(key || "").trim().toLowerCase().replace(/\s+/g, "_")] = value;
  }
  const nome = mapped.nome ?? mapped.name ?? "";
  const cpf = mapped.cpf ?? mapped.documento ?? mapped.document ?? "";
  const funcao = mapped.funcao ?? mapped.função ?? mapped.role ?? mapped.cargo ?? "";
  return {
    name: String(nome || "").trim(),
    document: onlyDigits(cpf),
    roleDescription: String(funcao || "").trim(),
  };
}

async function getCpfDocumentTypeId() {
  const [rows] = await db.execute(
    `SELECT id_collaborator_document_type
       FROM collaborator_document_type
      WHERE UPPER(description) = 'CPF'
         OR UPPER(description) LIKE 'CPF%'
      ORDER BY id_collaborator_document_type ASC
      LIMIT 1`,
  );
  if (!rows.length) {
    throw new AppError("Tipo de documento CPF não configurado.", 500);
  }
  return Number(rows[0].id_collaborator_document_type);
}

async function resolveOrCreateRoleId(description) {
  const normalized = String(description || "").trim() || "Colaborador";
  const [existing] = await db.execute(
    `SELECT id_collaborator_role FROM collaborator_role
      WHERE LOWER(description) = LOWER(?) LIMIT 1`,
    [normalized],
  );
  if (existing.length) return Number(existing[0].id_collaborator_role);
  const [result] = await db.execute(
    `INSERT INTO collaborator_role (description) VALUES (?)`,
    [normalized],
  );
  return Number(result.insertId);
}

async function listCompanyLinksOnEvent(idEvent, idCompany) {
  const [rows] = await db.execute(
    `SELECT edc.*, ed.id_event_day, ed.id_event, ed.date,
            e.id_company_responsavel, e.ativo AS event_ativo,
            c.company_name, c.id_company_type
       FROM event_day_company edc
       INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
       INNER JOIN event e ON e.id_event = ed.id_event
       INNER JOIN company c ON c.id_company = edc.id_company
      WHERE ed.id_event = ? AND edc.id_company = ?
      ORDER BY ed.date ASC`,
    [idEvent, idCompany],
  );
  return rows;
}

async function assertCanBulkCredentialsForCompany(req, idEvent, idCompany) {
  assertCanCreate(req);
  const links = await listCompanyLinksOnEvent(idEvent, idCompany);
  if (!links.length) {
    throw new AppError("Empresa não vinculada a este evento.", 404);
  }
  if (links[0]) assertLinkedEventActive(links[0]);
  for (const link of links) {
    await assertCanOperateOnLink(req, link);
  }
  return links;
}

async function previewEventCompanyCredentialsBulk(req, idEvent, idCompany, file) {
  const eventId = Number(idEvent);
  const companyId = Number(idCompany);
  const links = await assertCanBulkCredentialsForCompany(req, eventId, companyId);
  const cpfTypeId = await getCpfDocumentTypeId();

  const rawRows = await parseBulkFile(file.buffer, file.mimetype, file.originalname);
  const rows = [];
  const sessionRows = [];

  for (let i = 0; i < rawRows.length; i++) {
    const line = i + 2;
    const parsed = normalizeEventCredBulkRow(rawRows[i]);
    if (!parsed.name && !parsed.document && !parsed.roleDescription) continue;

    if (!parsed.name) {
      const item = {
        line,
        status: "error",
        key: { document: parsed.document },
        incoming: parsed,
        message: "Nome obrigatório.",
      };
      rows.push(item);
      sessionRows.push({ ...item, id_collaborator: null, id_collaborator_role: null });
      continue;
    }
    if (!parsed.document || parsed.document.length !== 11) {
      const item = {
        line,
        status: "error",
        key: { document: parsed.document },
        incoming: parsed,
        message: "CPF deve ter 11 dígitos.",
      };
      rows.push(item);
      sessionRows.push({ ...item, id_collaborator: null, id_collaborator_role: null });
      continue;
    }

    const [existingRows] = await db.execute(
      `SELECT id_collaborator, name, document, status
         FROM collaborator
        WHERE document = ? AND id_collaborator_document_type = ?
        LIMIT 1`,
      [parsed.document, cpfTypeId],
    );
    const existing = existingRows[0] || null;
    const roleId = await resolveOrCreateRoleId(parsed.roleDescription);
    const status = existing ? "link" : "create";
    const item = {
      line,
      status,
      key: { document: parsed.document, id_collaborator_document_type: cpfTypeId },
      incoming: {
        name: parsed.name,
        document: parsed.document,
        role: parsed.roleDescription || "Colaborador",
        id_collaborator_role: roleId,
      },
      existing: existing
        ? {
            id_collaborator: existing.id_collaborator,
            name: existing.name,
            document: existing.document,
          }
        : undefined,
      message: existing
        ? "Cadastro existente — será credenciado nos dias da empresa."
        : "Novo colaborador — será cadastrado e credenciado.",
    };
    rows.push(item);
    sessionRows.push({
      ...item,
      id_collaborator: existing ? Number(existing.id_collaborator) : null,
      id_collaborator_role: roleId,
      id_collaborator_document_type: cpfTypeId,
      validated: {
        name: parsed.name,
        document: parsed.document,
        id_collaborator_role: roleId,
        id_collaborator_document_type: cpfTypeId,
      },
    });
  }

  if (!rows.length) {
    throw new AppError(
      "Nenhuma linha de dados encontrada. Cabeçalho: nome, cpf, funcao.",
      400,
    );
  }

  const previewId = savePreviewSession({
    kind: "event_company_credentials",
    userId: req.user?.id || null,
    idEvent: eventId,
    idCompany: companyId,
    linkIds: links.map((l) => Number(l.id_event_day_company)),
    rows: sessionRows,
  });

  const summary = {
    total: rows.length,
    create: rows.filter((r) => r.status === "create").length,
    link: rows.filter((r) => r.status === "link").length,
    update: 0,
    error: rows.filter((r) => r.status === "error").length,
  };

  return { previewId, summary, rows, updateFields: [] };
}

async function commitEventCompanyCredentialsBulk(req, idEvent, idCompany, { previewId, decisions }) {
  const eventId = Number(idEvent);
  const companyId = Number(idCompany);
  const links = await assertCanBulkCredentialsForCompany(req, eventId, companyId);

  const session = getPreviewSession(previewId, "event_company_credentials");
  if (session.userId && req.user?.id && Number(session.userId) !== Number(req.user.id)) {
    throw new AppError("Pré-visualização pertence a outro usuário.", 403);
  }
  if (Number(session.idEvent) !== eventId || Number(session.idCompany) !== companyId) {
    throw new AppError("Pré-visualização incompatível com este evento/empresa.", 400);
  }

  const decisionMap = new Map((decisions || []).map((d) => [Number(d.line), d]));
  let created = 0;
  let linked = 0;
  let skipped = 0;
  const errors = [];
  let credentialsCreated = 0;

  for (const row of session.rows) {
    const decision = decisionMap.get(row.line);
    const action = decision?.action || (row.status === "error" ? "skip" : row.status);
    if (action === "skip" || row.status === "error") {
      skipped += 1;
      continue;
    }

    try {
      let collaboratorId = row.id_collaborator;
      if (!collaboratorId) {
        const createdCol = await collaboratorService.insertCollaboratorRecord({
          name: row.validated.name,
          document: row.validated.document,
          id_collaborator_document_type: row.validated.id_collaborator_document_type,
          id_collaborator_role: row.validated.id_collaborator_role,
          status: true,
        });
        collaboratorId = Number(createdCol.id_collaborator);
        created += 1;
      } else {
        linked += 1;
      }

      await collaboratorService.linkCollaboratorToCompany(collaboratorId, companyId);

      for (const link of links) {
        try {
          await createCredential(req, {
            id_event_day_company: Number(link.id_event_day_company),
            id_collaborator: collaboratorId,
            id_collaborator_role: row.id_collaborator_role,
          });
          credentialsCreated += 1;
        } catch (err) {
          if (err.statusCode === 409 || /já credenciado|já existe|duplicad/i.test(err.message || "")) {
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      errors.push({ line: row.line, reason: err.message || "Falha ao importar." });
    }
  }

  deletePreviewSession(previewId);

  return {
    created,
    linked,
    skipped,
    credentialsCreated,
    errors,
    totalDecisions: session.rows.length,
  };
}

module.exports = {
  parseListQuery,
  parseListFilters,
  buildCredentialScope,
  listCredentials,
  getCredentialById,
  createCredential,
  updateCredentialStatus,
  previewEventCompanyCredentialsBulk,
  commitEventCompanyCredentialsBulk,
  assertCanOperateOnLink,
  listCompanyLinksOnEvent,
  resolveInitialStatus,
  assertCanBulkCredentialsForCompany,
};
