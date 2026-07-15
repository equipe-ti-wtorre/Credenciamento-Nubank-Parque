const db = require("../../config/db");
const env = require("../../config/env");
const AppError = require("../../utils/AppError");
const { toDateOnly } = require("./event.schema");
const companyService = require("../companies/company.service");
const approvalsService = require("../approvals/approvals.service");
const {
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_APROVADO,
  STATUS_NEGADO,
} = require("../credentials/credentials.schema");
const { buildEventScope: buildScopeFromUser } = require("../../utils/permissions");

const TYPE_PRODUTORA = "Produtora";
const TYPE_EMPRESA_PADRAO = "Empresa Padrão";

/** Tabela prevista no Passo 5 (credenciamento por vínculo dia-empresa). */
const CREDENTIAL_LINK_TABLE = "event_day_company_collaborator";

let cachedProdutoraTypeId = null;
let cachedEmpresaPadraoTypeId = null;

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

function buildEventScope(req) {
  return buildScopeFromUser(req.user);
}

function formatDateField(value) {
  if (!value) return value;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function mapEventRow(row) {
  return {
    id_event: row.id_event,
    name: row.name,
    start: formatDateField(row.start),
    end: formatDateField(row.end),
    id_access_status: row.id_access_status != null ? Number(row.id_access_status) : null,
    access_status_description: row.access_status_description || null,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

async function loadEventApprovalSummary(idEvent) {
  const [rows] = await db.execute(
    `SELECT id, status, nivel_atual, niveis_exigidos, id_setor
       FROM aprovacoes
      WHERE tipo_entidade = 'EVENTO' AND id_entidade = ?
      ORDER BY id DESC
      LIMIT 1`,
    [idEvent],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row.id,
    status: row.status,
    nivelAtual: row.nivel_atual,
    niveisExigidos: row.niveis_exigidos,
    idSetor: row.id_setor,
  };
}

function mapCompanyBrief(row) {
  if (!row || row.id_company == null) return null;
  return {
    id_company: row.id_company,
    company_name: row.company_name,
    fancy_name: row.fancy_name || null,
    id_company_type: row.id_company_type,
    company_type_description: row.type_description ?? row.company_type_description,
  };
}

function parseListQuery(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit };
}

function parseListFilters(query) {
  const filters = {};
  if (query.name) filters.name = String(query.name).trim();
  return filters;
}

function buildListJoinAndWhere(scope, filters) {
  const conditions = [];
  const params = [];
  let join = "";

  if (scope.mode === "company") {
    join = `
      INNER JOIN event_day ed ON ed.id_event = e.id_event
      INNER JOIN event_day_company edc ON edc.id_event_day = ed.id_event_day
    `;
    conditions.push("edc.id_company = ?");
    params.push(scope.companyId);
  }

  if (filters.name) {
    conditions.push("e.name LIKE ?");
    params.push(`%${filters.name}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { join, where, params };
}

async function assertCanReadEvent(req, idEvent) {
  const scope = buildEventScope(req);
  if (scope.mode === "admin") return;

  const [rows] = await db.execute(
    `SELECT 1
     FROM event_day ed
     INNER JOIN event_day_company edc ON edc.id_event_day = ed.id_event_day
     WHERE ed.id_event = ? AND edc.id_company = ?
     LIMIT 1`,
    [idEvent, scope.companyId],
  );
  if (rows.length === 0) {
    throw new AppError("Evento não encontrado.", 404);
  }
}

async function listEventDayTypes() {
  const [rows] = await db.execute(
    "SELECT id_event_day_type, description FROM event_day_type ORDER BY description ASC",
  );
  return rows.map((r) => ({
    id_event_day_type: r.id_event_day_type,
    description: r.description,
  }));
}

async function assertEventDayTypeExists(idType, conn = db) {
  const [rows] = await conn.execute(
    "SELECT id_event_day_type FROM event_day_type WHERE id_event_day_type = ? LIMIT 1",
    [idType],
  );
  if (rows.length === 0) {
    throw new AppError("Tipo de dia de evento inválido.", 400);
  }
}

async function findEventById(id) {
  const [rows] = await db.execute(
    `SELECT e.*, ast.description AS access_status_description
       FROM event e
       LEFT JOIN access_status ast ON ast.id_access_status = e.id_access_status
      WHERE e.id_event = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findEventDayWithEvent(idEventDay) {
  const [rows] = await db.execute(
    `SELECT ed.*, e.start AS event_start, e.end AS event_end, e.name AS event_name
     FROM event_day ed
     INNER JOIN event e ON e.id_event = ed.id_event
     WHERE ed.id_event_day = ? LIMIT 1`,
    [idEventDay],
  );
  return rows[0] || null;
}

async function findCompanyWithType(idCompany) {
  const row = await companyService.findCompanyById(idCompany);
  if (!row) return null;
  return row;
}

async function isProducerLinkedToDay(idEventDay, idProducer, conn = db) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM event_day_company
     WHERE id_event_day = ? AND id_company = ? LIMIT 1`,
    [idEventDay, idProducer],
  );
  return rows.length > 0;
}

async function tableExists(tableName) {
  const [rows] = await db.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [env.db.name, tableName],
  );
  return rows.length > 0;
}

async function assertNoCredentialedCollaborators(idEventDayCompany) {
  if (!(await tableExists(CREDENTIAL_LINK_TABLE))) return;

  const [rows] = await db.execute(
    `SELECT COUNT(*) AS total FROM ${CREDENTIAL_LINK_TABLE}
     WHERE id_event_day_company = ?`,
    [idEventDayCompany],
  );
  if (rows[0].total > 0) {
    throw new AppError(
      "Não é possível remover o vínculo: existem colaboradores credenciados associados.",
      400,
    );
  }
}

async function loadEventDaysWithCompanies(idEvent) {
  const [dayRows] = await db.execute(
    `SELECT ed.id_event_day, ed.id_event, ed.id_type, ed.date,
            edt.id_event_day_type, edt.description AS type_description
     FROM event_day ed
     INNER JOIN event_day_type edt ON edt.id_event_day_type = ed.id_type
     WHERE ed.id_event = ?
     ORDER BY ed.date ASC, ed.id_event_day ASC`,
    [idEvent],
  );

  if (dayRows.length === 0) return [];

  const dayIds = dayRows.map((d) => d.id_event_day);
  const placeholders = dayIds.map(() => "?").join(", ");

  const [companyRows] = await db.execute(
    `SELECT edc.id_event_day_company, edc.id_event_day, edc.id_company, edc.id_producer,
            c.company_name, c.fancy_name, c.id_company_type,
            ct.description AS company_type_description,
            pc.company_name AS producer_company_name,
            pc.fancy_name AS producer_fancy_name,
            pc.id_company_type AS producer_company_type,
            pct.description AS producer_type_description
     FROM event_day_company edc
     INNER JOIN company c ON c.id_company = edc.id_company
     INNER JOIN company_type ct ON ct.id_company_type = c.id_company_type
     LEFT JOIN company pc ON pc.id_company = edc.id_producer
     LEFT JOIN company_type pct ON pct.id_company_type = pc.id_company_type
     WHERE edc.id_event_day IN (${placeholders})
     ORDER BY c.company_name ASC`,
    dayIds,
  );

  const companiesByDay = new Map();
  for (const row of companyRows) {
    if (!companiesByDay.has(row.id_event_day)) {
      companiesByDay.set(row.id_event_day, []);
    }
    companiesByDay.get(row.id_event_day).push({
      id_event_day_company: row.id_event_day_company,
      company: {
        id_company: row.id_company,
        company_name: row.company_name,
        fancy_name: row.fancy_name || null,
        id_company_type: row.id_company_type,
        company_type_description: row.company_type_description,
      },
      producer: row.id_producer
        ? {
            id_company: row.id_producer,
            company_name: row.producer_company_name,
            fancy_name: row.producer_fancy_name || null,
            id_company_type: row.producer_company_type,
            company_type_description: row.producer_type_description,
          }
        : null,
    });
  }

  return dayRows.map((d) => ({
    id_event_day: d.id_event_day,
    date: formatDateField(d.date),
    type: {
      id_event_day_type: d.id_event_day_type,
      description: d.type_description,
    },
    companies: companiesByDay.get(d.id_event_day) || [],
  }));
}

async function getEventDetailById(id) {
  const row = await findEventById(id);
  if (!row) throw new AppError("Evento não encontrado.", 404);
  const days = await loadEventDaysWithCompanies(id);
  const approval = await loadEventApprovalSummary(id);
  return { ...mapEventRow(row), days, approval };
}

async function listEvents(req, { page, limit, filters }) {
  const scope = buildEventScope(req);
  const offset = (page - 1) * limit;
  const { join, where, params } = buildListJoinAndWhere(scope, filters);

  const [rows] = await db.execute(
    `SELECT DISTINCT e.id_event, e.name, e.start, e.end, e.id_access_status,
            e.criado_em, e.atualizado_em, ast.description AS access_status_description
     FROM event e
     LEFT JOIN access_status ast ON ast.id_access_status = e.id_access_status
     ${join}
     ${where}
     ORDER BY e.start DESC, e.id_event DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(DISTINCT e.id_event) AS total FROM event e ${join} ${where}`,
    params,
  );

  return {
    events: rows.map(mapEventRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function getEventById(req, id) {
  const row = await findEventById(id);
  if (!row) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, id);
  return getEventDetailById(id);
}

async function createEvent(req, data) {
  const start = toDateOnly(data.start);
  const end = toDateOnly(data.end);
  if (start > end) {
    throw new AppError(
      "A data de início deve ser anterior ou igual à data de término.",
      400,
    );
  }

  const days = data.days || [];
    const idSetor = Number(data.id_setor);
  const idSolicitante = req.user?.id;
  if (!idSolicitante) {
    throw new AppError("Usuário não autenticado.", 401);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await approvalsService.assertUserCanOpenForSector(conn, idSetor, req.user);

    const [result] = await conn.execute(
      "INSERT INTO event (name, start, end, id_access_status) VALUES (?, ?, ?, ?)",
      [data.name, start, end, STATUS_AGUARDANDO_APROVACAO],
    );
    const eventId = result.insertId;

    for (const day of days) {
      const dayDate = toDateOnly(day.date);
      if (dayDate < start || dayDate > end) {
        throw new AppError(
          "A data do dia deve estar entre a data de início e a data de término do evento.",
          400,
        );
      }
      await assertEventDayTypeExists(day.id_type, conn);
      await conn.execute(
        "INSERT INTO event_day (id_event, id_type, date) VALUES (?, ?, ?)",
        [eventId, day.id_type, dayDate],
      );
    }

    const approval = await approvalsService.createApprovalFor(conn, {
      tipoEntidade: "EVENTO",
      idEntidade: eventId,
      idSetor,
      idSolicitante,
    });

    await conn.commit();
    const detail = await getEventDetailById(eventId);
    return { ...detail, approvalCreated: approval };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function markApproved(conn, idEntidade) {
  await conn.execute(`UPDATE event SET id_access_status = ? WHERE id_event = ?`, [
    STATUS_APROVADO,
    idEntidade,
  ]);
}

async function markRejected(conn, idEntidade) {
  await conn.execute(`UPDATE event SET id_access_status = ? WHERE id_event = ?`, [
    STATUS_NEGADO,
    idEntidade,
  ]);
}

async function resolveEventSetorId(conn, idEvent) {
  const [rows] = await conn.execute(
    `SELECT id_setor FROM aprovacoes
      WHERE tipo_entidade = 'EVENTO' AND id_entidade = ?
      ORDER BY CASE status WHEN 'PENDENTE' THEN 0 ELSE 1 END, id DESC
      LIMIT 1`,
    [idEvent],
  );
  if (rows[0]?.id_setor != null) return Number(rows[0].id_setor);

  const [fallback] = await conn.execute(
    `SELECT s.id
       FROM setores s
       INNER JOIN setor_fluxos sf
         ON sf.id_setor = s.id AND sf.tipo_entidade = 'EVENTO' AND sf.ativo = 1
      WHERE s.ativo = 1
      ORDER BY s.id ASC
      LIMIT 1`,
  );
  return fallback[0]?.id != null ? Number(fallback[0].id) : null;
}

/**
 * Reabre aprovação do evento após alteração relevante (ex.: período).
 */
async function reopenEventForApproval(conn, eventRow, { force = false, idSetor = null, idSolicitante = null } = {}) {
  const idEvent = eventRow.id_event || eventRow.id;
  const status = Number(eventRow.id_access_status);
  const needsReopen = force || status === STATUS_APROVADO || status === STATUS_NEGADO;

  const [pending] = await conn.execute(
    `SELECT id FROM aprovacoes
      WHERE tipo_entidade = 'EVENTO' AND id_entidade = ? AND status = 'PENDENTE'
      LIMIT 1`,
    [idEvent],
  );

  if (pending.length) {
    if (needsReopen) {
      await conn.execute(`UPDATE event SET id_access_status = ? WHERE id_event = ?`, [
        STATUS_AGUARDANDO_APROVACAO,
        idEvent,
      ]);
      return { reopened: true, created: false, idAprovacao: pending[0].id };
    }
    return { reopened: false, created: false, idAprovacao: pending[0].id };
  }

  if (!needsReopen && status !== STATUS_AGUARDANDO_APROVACAO) {
    return { reopened: false, created: false, idAprovacao: null };
  }

  await conn.execute(`UPDATE event SET id_access_status = ? WHERE id_event = ?`, [
    STATUS_AGUARDANDO_APROVACAO,
    idEvent,
  ]);

  const resolvedSetor = idSetor != null ? Number(idSetor) : await resolveEventSetorId(conn, idEvent);
  if (!resolvedSetor) {
    throw new AppError(
      "Não foi possível reabrir a aprovação: setor aprovador não encontrado.",
      422,
    );
  }

  let resolvedSolicitante = idSolicitante;
  if (!resolvedSolicitante) {
    const [solRows] = await conn.execute(
      `SELECT id_solicitante FROM aprovacoes
        WHERE tipo_entidade = 'EVENTO' AND id_entidade = ?
        ORDER BY id ASC
        LIMIT 1`,
      [idEvent],
    );
    resolvedSolicitante = solRows[0]?.id_solicitante || null;
  }
  if (!resolvedSolicitante) {
    throw new AppError(
      "Não foi possível reabrir a aprovação: solicitante não encontrado.",
      422,
    );
  }

  const approval = await approvalsService.createApprovalFor(conn, {
    tipoEntidade: "EVENTO",
    idEntidade: idEvent,
    idSetor: resolvedSetor,
    idSolicitante: resolvedSolicitante,
  });

  return { reopened: true, created: true, idAprovacao: approval.id };
}

async function updateEventPeriod(req, id, data) {
  const eventRow = await findEventById(id);
  if (!eventRow) throw new AppError("Evento não encontrado.", 404);
  await assertCanReadEvent(req, id);

  const start = toDateOnly(data.start);
  const end = toDateOnly(data.end);
  if (start > end) {
    throw new AppError(
      "A data de início deve ser anterior ou igual à data de término.",
      400,
    );
  }

  const [dayRows] = await db.execute(
    `SELECT id_event_day, date FROM event_day WHERE id_event = ? ORDER BY date ASC`,
    [id],
  );
  for (const day of dayRows) {
    const dayDate = formatDateField(day.date);
    if (dayDate < start || dayDate > end) {
      throw new AppError(
        `O dia ${dayDate} fica fora do novo período. Ajuste ou remova os dias fora do intervalo antes de salvar.`,
        422,
      );
    }
  }

  const previousStart = formatDateField(eventRow.start);
  const previousEnd = formatDateField(eventRow.end);
  const datesChanged = previousStart !== start || previousEnd !== end;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`UPDATE event SET start = ?, end = ? WHERE id_event = ?`, [
      start,
      end,
      id,
    ]);

    let reopenResult = { reopened: false, created: false, idAprovacao: null };
    if (datesChanged) {
      reopenResult = await reopenEventForApproval(conn, eventRow, {
        force: Number(eventRow.id_access_status) === STATUS_APROVADO,
        idSolicitante: req.user?.id || null,
      });
    }

    await conn.commit();
    const detail = await getEventDetailById(id);
    return {
      ...detail,
      periodChanged: datesChanged,
      approvalReopened: !!reopenResult.reopened,
      id_aprovacao: reopenResult.idAprovacao || detail.approval?.id || null,
      aprovacao_status: detail.approval?.status || null,
      id_setor: detail.approval?.idSetor || null,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function addCompanyToEventDay(idEventDay, payload) {
  const eventDay = await findEventDayWithEvent(idEventDay);
  if (!eventDay) throw new AppError("Dia de evento não encontrado.", 404);

  const company = await companyService.findActiveCompanyById(payload.id_company);
  if (!company) {
    throw new AppError("Empresa não encontrada ou inativa.", 400);
  }

  const produtoraTypeId = await getProdutoraTypeId();
  const padraoTypeId = await getEmpresaPadraoTypeId();

  let idProducer = null;

  if (company.id_company_type === produtoraTypeId) {
    if (payload.id_producer != null) {
      throw new AppError(
        "Empresa do tipo Produtora não deve informar produtora responsável.",
        400,
      );
    }
    idProducer = null;
  } else if (company.id_company_type === padraoTypeId) {
    if (payload.id_producer == null) {
      throw new AppError(
        "Empresa do tipo Empresa Padrão deve informar a produtora responsável (id_producer).",
        400,
      );
    }

    const producer = await companyService.findActiveCompanyById(payload.id_producer);
    if (!producer) {
      throw new AppError("Produtora responsável não encontrada ou inativa.", 400);
    }
    if (producer.id_company_type !== produtoraTypeId) {
      throw new AppError(
        "A produtora responsável deve ser uma empresa do tipo Produtora.",
        400,
      );
    }

    const linked = await isProducerLinkedToDay(idEventDay, payload.id_producer);
    if (!linked) {
      throw new AppError(
        "Produtora responsável não está vinculada a este dia.",
        400,
      );
    }

    idProducer = payload.id_producer;
  } else {
    throw new AppError("Tipo de empresa não permitido na matriz de eventos.", 400);
  }

  try {
    const [result] = await db.execute(
      `INSERT INTO event_day_company (id_event_day, id_company, id_producer)
       VALUES (?, ?, ?)`,
      [idEventDay, payload.id_company, idProducer],
    );

    const [rows] = await db.execute(
      `SELECT edc.*, c.company_name, c.fancy_name, c.id_company_type,
              ct.description AS company_type_description
       FROM event_day_company edc
       INNER JOIN company c ON c.id_company = edc.id_company
       INNER JOIN company_type ct ON ct.id_company_type = c.id_company_type
       WHERE edc.id_event_day_company = ? LIMIT 1`,
      [result.insertId],
    );

    const row = rows[0];
    let producer = null;
    if (row.id_producer) {
      const prodRow = await findCompanyWithType(row.id_producer);
      producer = mapCompanyBrief(prodRow);
    }

    return {
      id_event_day_company: row.id_event_day_company,
      id_event_day: row.id_event_day,
      id_company: row.id_company,
      id_producer: row.id_producer,
      company: mapCompanyBrief(row),
      producer,
    };
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      throw new AppError("Empresa já vinculada a este dia de evento.", 409);
    }
    throw err;
  }
}

async function findEventDayCompanyById(id) {
  const [rows] = await db.execute(
    `SELECT edc.*, ed.id_event
     FROM event_day_company edc
     INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
     WHERE edc.id_event_day_company = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function removeCompanyFromEventDay(idEventDayCompany) {
  const link = await findEventDayCompanyById(idEventDayCompany);
  if (!link) {
    throw new AppError("Vínculo empresa-dia não encontrado.", 404);
  }

  await assertNoCredentialedCollaborators(idEventDayCompany);

  await db.execute(
    "DELETE FROM event_day_company WHERE id_event_day_company = ?",
    [idEventDayCompany],
  );

  return {
    id_event_day_company: link.id_event_day_company,
    id_event_day: link.id_event_day,
    id_company: link.id_company,
    id_producer: link.id_producer,
  };
}

module.exports = {
  parseListQuery,
  parseListFilters,
  listEventDayTypes,
  listEvents,
  getEventById,
  createEvent,
  updateEventPeriod,
  reopenEventForApproval,
  addCompanyToEventDay,
  removeCompanyFromEventDay,
  markApproved,
  markRejected,
};
