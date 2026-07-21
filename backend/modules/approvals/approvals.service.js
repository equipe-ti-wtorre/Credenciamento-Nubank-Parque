'use strict';

/**
 * approvals.service.js
 * Máquina de estados do workflow genérico de aprovações.
 */

const pool = require('../../config/db');
const AppError = require('../../utils/AppError');
const { child } = require('../../config/logger');

const log = child({ module: 'approvals' });

const ENTITY_TYPES = Object.freeze(['EVENTO', 'ACESSO_SERVICO']);
const STATUS = Object.freeze({
  PENDENTE: 'PENDENTE',
  APROVADO: 'APROVADO',
  REPROVADO: 'REPROVADO',
  CANCELADO: 'CANCELADO',
  EXPIRADO: 'EXPIRADO',
});

const PAPEIS_CAN_APPROVE = ['APROVADOR', 'GESTOR'];
const PAPEIS_CAN_OPEN = ['SOLICITANTE', 'APROVADOR', 'GESTOR'];

/** Usuários de empresa (PRODUTORA/PADRAO/EMPRESA_*) abrem solicitações sem vínculo em setor_usuarios. */
function isCompanyScopedUser(user) {
  return typeof user === 'object' && !!user?.requires_company;
}

/** R4 — mude para true se quiser permitir que o mesmo usuário decida vários níveis. */
const ALLOW_SAME_USER_MULTIPLE_LEVELS = false;

const MAX_COMMENT_LENGTH = 500;

const entityFinalizers = new Map();

function registerEntityFinalizer(tipoEntidade, handlers) {
  if (!ENTITY_TYPES.includes(tipoEntidade)) {
    throw new Error(`Tipo de entidade inválido: ${tipoEntidade}`);
  }
  entityFinalizers.set(tipoEntidade, handlers || {});
}

async function runFinalizer(conn, aprovacao, resultado, extraCtx = {}) {
  const handlers = entityFinalizers.get(aprovacao.tipo_entidade);
  if (!handlers) {
    log.warn(
      { tipoEntidade: aprovacao.tipo_entidade, idAprovacao: aprovacao.id },
      'Nenhum finalizador registrado para o tipo de entidade',
    );
    return;
  }
  let fn = null;
  if (resultado === STATUS.APROVADO) fn = handlers.onApproved;
  else if (resultado === STATUS.REPROVADO) fn = handlers.onRejected;
  else if (resultado === STATUS.EXPIRADO) fn = handlers.onExpired;
  if (typeof fn === 'function') {
    await fn(conn, aprovacao.id_entidade, { aprovacao, ...extraCtx });
  }
}

/**
 * Retorna a data final (YYYY-MM-DD) da entidade vinculada à aprovação, ou null.
 */
async function getEntityEndDate(conn, tipoEntidade, idEntidade) {
  if (tipoEntidade === 'EVENTO') {
    const [rows] = await conn.query(
      `SELECT end AS end_date FROM event WHERE id_event = ? LIMIT 1`,
      [idEntidade],
    );
    return formatDateOnly(rows[0]?.end_date);
  }
  if (tipoEntidade === 'ACESSO_SERVICO') {
    const [rows] = await conn.query(
      `SELECT end_date FROM service_access WHERE id_service_access = ? LIMIT 1`,
      [idEntidade],
    );
    return formatDateOnly(rows[0]?.end_date);
  }
  return null;
}

function todayDateOnly() {
  // Alinhado ao timezone do MySQL (DB_TIMEZONE=-03:00 / America/Sao_Paulo).
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function isEndDatePast(endDate) {
  if (!endDate) return false;
  return endDate < todayDateOnly();
}

/**
 * Marca uma aprovação pendente como EXPIRADO e dispara o finalizador da entidade.
 * Assume que a conexão já está em transação e a linha foi bloqueada (FOR UPDATE).
 */
async function markApprovalExpired(conn, aprovacao) {
  await conn.query(
    `UPDATE aprovacoes
        SET status = 'EXPIRADO', finalizado_em = NOW()
      WHERE id = ? AND status = 'PENDENTE'`,
    [aprovacao.id],
  );
  await runFinalizer(conn, aprovacao, STATUS.EXPIRADO);
}

/**
 * Finaliza aprovações PENDENTE cuja data final da entidade já passou.
 * Idempotente — seguro para cron e chamada no startup.
 */
async function expireOverdueApprovals() {
  const conn = await pool.getConnection();
  let expiredCount = 0;
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT a.*
         FROM aprovacoes a
         LEFT JOIN event e
           ON a.tipo_entidade = 'EVENTO' AND e.id_event = a.id_entidade
         LEFT JOIN service_access sa
           ON a.tipo_entidade = 'ACESSO_SERVICO' AND sa.id_service_access = a.id_entidade
        WHERE a.status = 'PENDENTE'
          AND (
            (a.tipo_entidade = 'EVENTO' AND e.end IS NOT NULL AND e.end < CURDATE())
            OR (a.tipo_entidade = 'ACESSO_SERVICO' AND sa.end_date IS NOT NULL AND sa.end_date < CURDATE())
          )
        FOR UPDATE`,
    );

    for (const aprovacao of rows) {
      await markApprovalExpired(conn, aprovacao);
      expiredCount += 1;
    }

    await conn.commit();
    if (expiredCount > 0) {
      log.info({ expiredCount }, 'Aprovações vencidas finalizadas como EXPIRADO');
    }
    return { ok: true, expiredCount };
  } catch (err) {
    await conn.rollback();
    log.error({ err }, 'Falha ao expirar aprovações vencidas');
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Se a entidade já passou da data final, expira a aprovação (ainda na transação)
 * e retorna true. O chamador deve fazer commit e então lançar o 409 —
 * senão o rollback desfaz a expiração.
 */
async function expireIfOverdue(conn, aprovacao) {
  const endDate = await getEntityEndDate(
    conn,
    aprovacao.tipo_entidade,
    aprovacao.id_entidade,
  );
  if (!isEndDatePast(endDate)) return false;

  await markApprovalExpired(conn, aprovacao);
  return true;
}

function expirationDecisionError() {
  return new AppError(
    'Tempo de autorização expirada. Esta solicitação não pode mais ser decidida porque o período solicitado já encerrou.',
    409,
  );
}

function assertEntityType(tipoEntidade) {
  if (!ENTITY_TYPES.includes(tipoEntidade)) {
    throw new AppError(`Tipo de entidade inválido: ${tipoEntidade}`, 400);
  }
}

function sanitizeComment(comentario) {
  if (comentario === undefined || comentario === null) return null;
  const value = String(comentario).trim();
  if (!value) return null;
  return value.slice(0, MAX_COMMENT_LENGTH);
}

function parseListQuery(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapEntidadeResumo(row) {
  const nome = row.entidade_nome || null;
  const startDate = formatDateOnly(row.entidade_start);
  const endDate = formatDateOnly(row.entidade_end);
  if (!nome && !startDate && !endDate) return null;
  return { nome, startDate, endDate };
}

function mapApprovalRow(row) {
  return {
    id: row.id,
    tipoEntidade: row.tipo_entidade,
    idEntidade: row.id_entidade,
    setor: { id: row.id_setor, nome: row.setor_nome },
    solicitante: { id: row.id_solicitante, nome: row.solicitante_nome || null },
    nivelAtual: row.nivel_atual,
    niveisExigidos: row.niveis_exigidos,
    status: row.status,
    criadoEm: row.criado_em,
    finalizadoEm: row.finalizado_em,
    entidadeResumo: mapEntidadeResumo(row),
    liberacaoResumo: null,
  };
}

/**
 * Conta liberados (access_id) e bloqueados (sem credencial após aprovação)
 * para acessos de serviço da listagem, em lote.
 */
async function attachLiberacaoResumo(items) {
  if (!Array.isArray(items) || !items.length) return items;

  const serviceItems = items.filter((item) => item.tipoEntidade === 'ACESSO_SERVICO');
  if (!serviceItems.length) return items;

  const ids = [...new Set(serviceItems.map((item) => item.idEntidade))];
  const placeholders = ids.map(() => '?').join(',');

  const [collabRows] = await pool.query(
    `SELECT id_service_access AS id,
            SUM(CASE WHEN access_id IS NOT NULL THEN 1 ELSE 0 END) AS liberados,
            COUNT(*) AS total
       FROM service_access_collaborator
      WHERE id_service_access IN (${placeholders})
      GROUP BY id_service_access`,
    ids,
  );

  const [vehicleRows] = await pool.query(
    `SELECT id_service_access AS id,
            SUM(CASE WHEN access_id IS NOT NULL THEN 1 ELSE 0 END) AS liberados,
            COUNT(*) AS total
       FROM service_access_vehicle
      WHERE id_service_access IN (${placeholders})
      GROUP BY id_service_access`,
    ids,
  );

  const collabById = new Map(collabRows.map((r) => [Number(r.id), r]));
  const vehicleById = new Map(vehicleRows.map((r) => [Number(r.id), r]));

  for (const item of items) {
    if (item.tipoEntidade !== 'ACESSO_SERVICO') {
      item.liberacaoResumo = null;
      continue;
    }

    const collab = collabById.get(Number(item.idEntidade));
    const vehicle = vehicleById.get(Number(item.idEntidade));
    const cLiberados = Number(collab?.liberados || 0);
    const cTotal = Number(collab?.total || 0);
    const vLiberados = Number(vehicle?.liberados || 0);
    const vTotal = Number(vehicle?.total || 0);

    // Somente após APROVADO os sem credencial contam como bloqueados.
    const countBloqueados = (liberados, total) =>
      item.status === STATUS.APROVADO ? Math.max(0, total - liberados) : 0;

    item.liberacaoResumo = {
      colaboradores: {
        liberados: cLiberados,
        bloqueados: countBloqueados(cLiberados, cTotal),
        total: cTotal,
      },
      veiculos: {
        liberados: vLiberados,
        bloqueados: countBloqueados(vLiberados, vTotal),
        total: vTotal,
      },
    };
  }

  return items;
}

function liberacaoResumoFromEntity(entidade, approvalStatus) {
  if (!entidade || entidade.tipo !== 'ACESSO_SERVICO') return null;

  const summarize = (list = []) => {
    let liberados = 0;
    let bloqueados = 0;
    for (const item of list) {
      const status = item.statusLiberacao || liberacaoStatus(null, approvalStatus);
      if (status === 'APROVADO') liberados += 1;
      else if (status === 'BLOQUEADO') bloqueados += 1;
    }
    return { liberados, bloqueados, total: list.length };
  };

  return {
    colaboradores: summarize(entidade.collaborators),
    veiculos: summarize(entidade.vehicles),
  };
}

function mapDecisionRow(row) {
  let metadata = row.metadata || null;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = null;
    }
  }
  return {
    id: row.id,
    nivel: row.nivel,
    niveisExigidos: row.niveis_exigidos != null ? Number(row.niveis_exigidos) : null,
    usuario: { id: row.id_usuario, nome: row.usuario_nome || null },
    decisao: row.decisao,
    comentario: row.comentario,
    decididoEm: row.decidido_em,
    metadata,
  };
}

function formatSelectiveDetail(metadata, nivel, comentario) {
  const lines = [`Nível ${nivel}`];
  if (comentario) lines.push(`Comentário: ${comentario}`);
  const aprovados = [
    ...(metadata?.aprovadosColaboradores || []).map((x) => x.nome),
    ...(metadata?.aprovadosVeiculos || []).map((x) => x.placa || x.nome),
  ].filter(Boolean);
  const bloqueados = [
    ...(metadata?.bloqueadosColaboradores || []).map((x) => x.nome),
    ...(metadata?.bloqueadosVeiculos || []).map((x) => x.placa || x.nome),
  ].filter(Boolean);
  if (aprovados.length) lines.push(`Aprovados: ${aprovados.join(', ')}`);
  if (bloqueados.length) lines.push(`Bloqueados: ${bloqueados.join(', ')}`);
  return lines.join('\n');
}

async function buildSelectiveApprovalMetadata(conn, aprovacao, {
  approvedCollaboratorIds,
  approvedVehicleIds,
} = {}) {
  if (aprovacao.tipo_entidade !== 'ACESSO_SERVICO') return null;

  const [collabRows] = await conn.query(
    `SELECT sac.id_service_access_collaborator AS id, c.name AS nome
       FROM service_access_collaborator sac
       INNER JOIN collaborator c ON c.id_collaborator = sac.id_collaborator
      WHERE sac.id_service_access = ?`,
    [aprovacao.id_entidade],
  );
  const [vehicleRows] = await conn.query(
    `SELECT sav.id_service_access_vehicle AS id, v.plate AS placa
       FROM service_access_vehicle sav
       INNER JOIN vehicle v ON v.id_vehicle = sav.id_vehicle
      WHERE sav.id_service_access = ?`,
    [aprovacao.id_entidade],
  );

  const filterCollabs = Array.isArray(approvedCollaboratorIds);
  const filterVehicles = Array.isArray(approvedVehicleIds);
  const collabSet = filterCollabs ? new Set(approvedCollaboratorIds.map(Number)) : null;
  const vehicleSet = filterVehicles ? new Set(approvedVehicleIds.map(Number)) : null;

  const aprovadosColaboradores = [];
  const bloqueadosColaboradores = [];
  for (const row of collabRows) {
    const item = { id: row.id, nome: row.nome };
    if (!filterCollabs || collabSet.has(Number(row.id))) aprovadosColaboradores.push(item);
    else bloqueadosColaboradores.push(item);
  }

  const aprovadosVeiculos = [];
  const bloqueadosVeiculos = [];
  for (const row of vehicleRows) {
    const item = { id: row.id, placa: row.placa };
    if (!filterVehicles || vehicleSet.has(Number(row.id))) aprovadosVeiculos.push(item);
    else bloqueadosVeiculos.push(item);
  }

  return {
    aprovadosColaboradores,
    bloqueadosColaboradores,
    aprovadosVeiculos,
    bloqueadosVeiculos,
  };
}

/** JOINs leves para título/período na listagem (sem colaboradores). */
const ENTITY_SUMMARY_JOINS = `
  LEFT JOIN service_access sa_e
    ON a.tipo_entidade = 'ACESSO_SERVICO' AND sa_e.id_service_access = a.id_entidade
  LEFT JOIN event ev_e
    ON a.tipo_entidade = 'EVENTO' AND ev_e.id_event = a.id_entidade`;

const ENTITY_SUMMARY_SELECT = `
  , COALESCE(sa_e.finalidade, sa_e.service_type, ev_e.name) AS entidade_nome
  , COALESCE(sa_e.start_date, ev_e.start) AS entidade_start
  , COALESCE(sa_e.end_date, ev_e.end) AS entidade_end`;

function liberacaoStatus(accessId, approvalStatus) {
  if (accessId) return 'APROVADO';
  if (approvalStatus === 'PENDENTE') return 'PENDENTE';
  if (
    approvalStatus === 'REPROVADO' ||
    approvalStatus === 'CANCELADO' ||
    approvalStatus === 'EXPIRADO'
  ) {
    return 'REPROVADO';
  }
  return 'BLOQUEADO';
}

async function loadServiceAccessEntity(idEntidade, { approvalStatus = null } = {}) {
  const [rows] = await pool.query(
    `SELECT sa.id_service_access, sa.start_date, sa.end_date, sa.finalidade, sa.service_type,
            sa.observacao, sa.description, sa.requesting_department,
            sa.criado_em, sa.atualizado_em,
            c.fancy_name AS company_fancy_name
       FROM service_access sa
       LEFT JOIN company c ON c.id_company = sa.id_company
      WHERE sa.id_service_access = ?
      LIMIT 1`,
    [idEntidade],
  );
  if (!rows.length) return null;
  const row = rows[0];

  const [collabRows] = await pool.query(
    `SELECT sac.id_service_access_collaborator, sac.id_collaborator, sac.id_collaborator_role,
            sac.access_id, sac.criado_em, sac.atualizado_em,
            c.name AS collaborator_name, c.document AS collaborator_document,
            c.picture AS collaborator_picture,
            cr.description AS role_description
       FROM service_access_collaborator sac
       INNER JOIN collaborator c ON c.id_collaborator = sac.id_collaborator
       INNER JOIN collaborator_role cr ON cr.id_collaborator_role = sac.id_collaborator_role
      WHERE sac.id_service_access = ?
      ORDER BY c.name ASC`,
    [idEntidade],
  );

  const [vehicleRows] = await pool.query(
    `SELECT sav.id_service_access_vehicle, sav.id_vehicle, sav.access_id,
            v.plate, v.brand, v.model
       FROM service_access_vehicle sav
       INNER JOIN vehicle v ON v.id_vehicle = sav.id_vehicle
      WHERE sav.id_service_access = ?
      ORDER BY v.plate ASC`,
    [idEntidade],
  );

  return {
    tipo: 'ACESSO_SERVICO',
    id: row.id_service_access,
    nome: row.finalidade || row.service_type || null,
    startDate: formatDateOnly(row.start_date),
    endDate: formatDateOnly(row.end_date),
    empresa: row.company_fancy_name || null,
    departamento: row.requesting_department || null,
    observacao: row.observacao ?? row.description ?? null,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    collaborators: collabRows.map((r) => ({
      id: r.id_service_access_collaborator,
      idCollaborator: r.id_collaborator,
      nome: r.collaborator_name,
      documento: r.collaborator_document,
      funcao: r.role_description,
      picture: r.collaborator_picture || null,
      criadoEm: r.criado_em,
      statusLiberacao: liberacaoStatus(r.access_id, approvalStatus),
    })),
    vehicles: vehicleRows.map((r) => ({
      id: r.id_service_access_vehicle,
      idVehicle: r.id_vehicle,
      placa: r.plate,
      marca: r.brand || null,
      modelo: r.model || null,
      criadoEm: null,
      statusLiberacao: liberacaoStatus(r.access_id, approvalStatus),
    })),
  };
}

async function loadEventEntity(idEntidade) {
  const [rows] = await pool.query(
    `SELECT e.id_event, e.name, e.start, e.end, e.criado_em, e.atualizado_em
       FROM event e
      WHERE e.id_event = ?
      LIMIT 1`,
    [idEntidade],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    tipo: 'EVENTO',
    id: row.id_event,
    nome: row.name || null,
    startDate: formatDateOnly(row.start),
    endDate: formatDateOnly(row.end),
    empresa: null,
    departamento: null,
    observacao: null,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    collaborators: [],
    vehicles: [],
  };
}

async function loadEntityForApproval(tipoEntidade, idEntidade, opts = {}) {
  if (tipoEntidade === 'ACESSO_SERVICO') return loadServiceAccessEntity(idEntidade, opts);
  if (tipoEntidade === 'EVENTO') return loadEventEntity(idEntidade);
  return null;
}

async function loadEntityAuditEvents(tipoEntidade, idEntidade) {
  const events =
    tipoEntidade === 'ACESSO_SERVICO'
      ? [
          'service_access.create',
          'service_access.update',
          'service_access.period_change',
          'service_access.collaborator.add',
          'service_access.collaborator.remove',
          'service_access.collaborators.bulk',
          'service_access.collaborators.bulk_commit',
          'service_access.vehicle.add',
          'service_access.vehicle.remove',
          'service_access.vehicles.bulk',
          'service_access.vehicles.bulk_commit',
          'service_access.bulk_import.confirm',
        ]
      : ['events.create', 'events.period_change', 'events.days.companies.add', 'events.days.companies.remove'];

  const [rows] = await pool.query(
    `SELECT al.id, al.user_id, al.action, al.created_at, al.metadata,
            u.nome_completo AS usuario_nome
       FROM audit_logs al
       LEFT JOIN usuarios u ON u.id = al.user_id
      WHERE JSON_UNQUOTE(JSON_EXTRACT(al.metadata, '$.event')) IN (${events.map(() => '?').join(',')})
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(al.metadata, '$.resource.id')) AS UNSIGNED) = ?
      ORDER BY al.created_at ASC, al.id ASC`,
    [...events, idEntidade],
  );

  return rows.map((r) => {
    let meta = r.metadata;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = {};
      }
    }
    return {
      event: meta?.event || null,
      action: r.action,
      data: r.created_at,
      usuario: r.user_id ? { id: r.user_id, nome: r.usuario_nome || null } : null,
      changes: meta?.changes || null,
      extra: meta?.extra && typeof meta.extra === 'object' ? meta.extra : {},
      metadata: meta,
    };
  });
}

function formatAuditDetail(e) {
  const event = e?.event || '';
  const extra = e?.extra || {};
  const changes = e?.changes;
  const meta = e?.metadata || {};

  if (/collaborator\.remove/.test(event)) {
    const nome = extra.nome || extra.collaborator_name || meta.nome || null;
    return nome ? `Colaborador removido: ${nome}` : 'Colaborador removido';
  }
  if (/vehicle\.remove/.test(event)) {
    const placa = extra.placa || extra.plate || meta.placa || null;
    return placa ? `Veículo removido: ${placa}` : 'Veículo removido';
  }
  if (/period_change/.test(event)) {
    const start = extra.start_date || meta.start_date || extra.start || meta.start || changes?.start_date;
    const end = extra.end_date || meta.end_date || extra.end || meta.end || changes?.end_date;
    if (start || end) {
      return `Período ajustado: ${start || '—'} – ${end || '—'}`;
    }
    return 'Período do acesso ajustado';
  }
  if (/service_access\.update/.test(event)) {
    if (changes && typeof changes === 'object') {
      const labels = {
        finalidade: 'Finalidade',
        observacao: 'Observação',
        description: 'Descrição',
        start_date: 'Data início',
        end_date: 'Data fim',
        requesting_department: 'Departamento',
        id_setor: 'Setor',
        id_company: 'Empresa',
      };
      const parts = Object.keys(changes)
        .map((k) => labels[k] || k)
        .filter(Boolean);
      if (parts.length) return `Campos alterados: ${parts.join(', ')}`;
    }
    return 'Dados gerais do acesso atualizados';
  }
  if (/collaborator\.add/.test(event)) {
    const nome = extra.nome || meta.nome || null;
    return nome ? `Colaborador adicionado: ${nome}` : 'Colaborador adicionado';
  }
  if (/vehicle\.add/.test(event)) {
    const placa = extra.placa || meta.placa || null;
    return placa ? `Veículo adicionado: ${placa}` : 'Veículo adicionado';
  }
  if (/collaborators\.bulk|bulk_commit/.test(event)) {
    const ok = extra.successCount ?? meta.successCount;
    const total = extra.totalProcessed ?? meta.totalProcessed;
    if (ok != null) {
      return `Importação de colaboradores: ${ok}${total != null ? `/${total}` : ''} incluído(s)`;
    }
    return 'Importação em lote de colaboradores';
  }
  if (/vehicles\.bulk/.test(event)) {
    return 'Importação em lote de veículos';
  }
  if (/bulk_import\.confirm/.test(event)) {
    return 'Importação em lote confirmada';
  }
  if (/days\.companies\.remove/.test(event)) {
    return 'Empresa removida do evento';
  }
  return null;
}

function pushHistorico(items, entry) {
  if (!entry?.data) return;
  items.push(entry);
}

function buildHistorico({
  aprovacao,
  solicitante,
  decisoes,
  entidade,
  auditEvents,
  ciclos = [],
}) {
  const items = [];
  const solicitanteUser = {
    id: aprovacao.id_solicitante,
    nome: solicitante?.nome || null,
  };

  const primeiraCriacao = ciclos[0]?.criado_em || aprovacao.criado_em;

  pushHistorico(items, {
    tipo: 'CRIACAO',
    titulo: 'Solicitação criada',
    data: primeiraCriacao,
    usuario: solicitanteUser,
    detalhe: null,
  });

  for (let i = 1; i < ciclos.length; i += 1) {
    const ciclo = ciclos[i];
    pushHistorico(items, {
      tipo: 'ALTERACAO',
      titulo: 'Nova aprovação solicitada',
      data: ciclo.criado_em,
      usuario: {
        id: ciclo.id_solicitante,
        nome: ciclo.solicitante_nome || solicitanteUser.nome,
      },
      detalhe: `Ciclo ${i + 1} reaberto após alteração`,
    });
  }

  const insertAudit = (auditEvents || []).filter((e) =>
    /collaborator\.add|collaborators\.bulk|vehicle\.add|vehicles\.bulk|bulk_import\.confirm|days\.companies\.add|events\.create/.test(
      e.event || '',
    ),
  );

  if (insertAudit.length) {
    for (const e of insertAudit) {
      pushHistorico(items, {
        tipo: 'INSERCAO_DADOS',
        titulo: 'Inserção dos dados pelo usuário',
        data: e.data,
        usuario: e.usuario || solicitanteUser,
        detalhe: formatAuditDetail(e) || e.event || null,
      });
    }
  } else {
    const collabDates = (entidade?.collaborators || [])
      .map((c) => c.criadoEm)
      .filter(Boolean)
      .sort();
    const vehicleDates = (entidade?.vehicles || [])
      .map((v) => v.criadoEm)
      .filter(Boolean)
      .sort();
    const firstInsert = collabDates[0] || vehicleDates[0] || null;
    if (firstInsert) {
      const nCollab = (entidade.collaborators || []).length;
      const nVeh = (entidade.vehicles || []).length;
      const parts = [];
      if (nCollab) parts.push(`${nCollab} colaborador(es)`);
      if (nVeh) parts.push(`${nVeh} veículo(s)`);
      pushHistorico(items, {
        tipo: 'INSERCAO_DADOS',
        titulo: 'Inserção dos dados pelo usuário',
        data: firstInsert,
        usuario: solicitanteUser,
        detalhe: parts.length ? parts.join(', ') : null,
      });
    }
  }

  const changeAudit = (auditEvents || []).filter((e) =>
    /service_access\.update|service_access\.period_change|events\.period_change|collaborator\.remove|vehicle\.remove|days\.companies\.remove/.test(
      e.event || '',
    ),
  );

  for (const e of changeAudit) {
    pushHistorico(items, {
      tipo: 'ALTERACAO',
      titulo: 'Alteração de informação pelo usuário',
      data: e.data,
      usuario: e.usuario || solicitanteUser,
      detalhe: formatAuditDetail(e) || 'Alteração registrada no acesso',
    });
  }

  for (const d of decisoes || []) {
    const isFinalApproval =
      d.decisao === 'APROVADO' &&
      d.niveisExigidos != null &&
      Number(d.nivel) >= Number(d.niveisExigidos);
    pushHistorico(items, {
      tipo: d.decisao === 'REPROVADO' ? 'REPROVACAO' : 'APROVACAO',
      titulo:
        d.decisao === 'REPROVADO'
          ? 'Reprovado'
          : isFinalApproval
            ? 'Aprovação final'
            : 'Aprovado',
      data: d.decididoEm,
      usuario: d.usuario,
      detalhe: formatSelectiveDetail(d.metadata, d.nivel, d.comentario),
    });
  }

  if (aprovacao.status === STATUS.CANCELADO) {
    pushHistorico(items, {
      tipo: 'CANCELAMENTO',
      titulo: 'Solicitação cancelada',
      data: aprovacao.finalizado_em,
      usuario: solicitanteUser,
      detalhe: null,
    });
  }

  items.sort((a, b) => {
    const da = new Date(a.data).getTime();
    const db = new Date(b.data).getTime();
    if (da !== db) return da - db;
    const rank = {
      CRIACAO: 1,
      INSERCAO_DADOS: 2,
      ALTERACAO: 3,
      APROVACAO: 4,
      REPROVACAO: 4,
      CANCELAMENTO: 5,
    };
    return (rank[a.tipo] || 9) - (rank[b.tipo] || 9);
  });
  return items;
}

async function ensureActiveFlowsForTipo(tipoEntidade) {
  assertEntityType(tipoEntidade);
  await pool.query(
    `INSERT INTO setor_fluxos (id_setor, tipo_entidade, niveis_exigidos, ativo)
     SELECT s.id, ?, 1, 1
       FROM setores s
      WHERE s.ativo = 1
        AND NOT EXISTS (
              SELECT 1 FROM setor_fluxos sf
               WHERE sf.id_setor = s.id AND sf.tipo_entidade = ?
            )`,
    [tipoEntidade, tipoEntidade],
  );
  await pool.query(
    `UPDATE setor_fluxos sf
       INNER JOIN setores s ON s.id = sf.id_setor
        SET sf.ativo = 1, sf.niveis_exigidos = 1
      WHERE sf.tipo_entidade = ? AND s.ativo = 1 AND sf.ativo = 0`,
    [tipoEntidade],
  );
}

async function listEligibleSectors(tipoEntidade, user) {
  assertEntityType(tipoEntidade);
  const userId = typeof user === 'object' ? user.id : user;
  const isAdmin = typeof user === 'object' ? !!user.is_super_admin : false;
  const companyScoped = isCompanyScopedUser(user);

  await ensureActiveFlowsForTipo(tipoEntidade);

  let rows;
  if (isAdmin || companyScoped) {
    [rows] = await pool.query(
      `SELECT s.id, s.nome, 1 AS niveis_exigidos
         FROM setor_fluxos sf
         JOIN setores s ON s.id = sf.id_setor
        WHERE sf.tipo_entidade = ? AND sf.ativo = 1 AND s.ativo = 1
        ORDER BY s.nome`,
      [tipoEntidade],
    );
  } else {
    [rows] = await pool.query(
      `SELECT s.id, s.nome, 1 AS niveis_exigidos
         FROM setor_fluxos sf
         JOIN setores s ON s.id = sf.id_setor
         JOIN setor_usuarios su ON su.id_setor = s.id AND su.id_usuario = ? AND su.ativo = 1
         JOIN usuarios u ON u.id = su.id_usuario AND u.ativo = 1
        WHERE sf.tipo_entidade = ? AND sf.ativo = 1 AND s.ativo = 1
          AND su.papel IN (${PAPEIS_CAN_OPEN.map(() => '?').join(',')})
        ORDER BY s.nome`,
      [userId, tipoEntidade, ...PAPEIS_CAN_OPEN],
    );
  }
  return rows.map((r) => ({ id: r.id, nome: r.nome, niveisExigidos: 1 }));
}

async function assertUserCanOpenForSector(conn, idSetor, user) {
  const dbConn = conn || pool;
  const userId = typeof user === 'object' ? user.id : user;
  const isAdmin = typeof user === 'object' ? !!user.is_super_admin : false;
  if (isAdmin) return;

  if (isCompanyScopedUser(user)) {
    const [sectorRows] = await dbConn.query(
      `SELECT id FROM setores WHERE id = ? AND ativo = 1 LIMIT 1`,
      [idSetor],
    );
    if (!sectorRows.length) {
      throw new AppError('Setor não encontrado ou inativo', 404);
    }
    return;
  }

  const [rows] = await dbConn.query(
    `SELECT su.papel
       FROM setor_usuarios su
       JOIN usuarios u ON u.id = su.id_usuario
       JOIN setores s ON s.id = su.id_setor
      WHERE su.id_setor = ? AND su.id_usuario = ?
        AND su.ativo = 1 AND u.ativo = 1 AND s.ativo = 1
      LIMIT 1`,
    [idSetor, userId],
  );
  if (!rows.length || !PAPEIS_CAN_OPEN.includes(rows[0].papel)) {
    throw new AppError('Usuário não é membro deste setor ou não pode abrir solicitações', 403);
  }
}

async function listEligibleApprovers(idSetor, _nivel, { excludeUserIds = [] } = {}) {
  const params = [idSetor, ...PAPEIS_CAN_APPROVE];
  let exclusion = '';
  if (excludeUserIds.length) {
    exclusion = ` AND su.id_usuario NOT IN (${excludeUserIds.map(() => '?').join(',')})`;
    params.push(...excludeUserIds);
  }
  const [rows] = await pool.query(
    `SELECT su.id_usuario, u.nome_completo AS nome, u.email
       FROM setor_usuarios su
       JOIN usuarios u ON u.id = su.id_usuario
      WHERE su.id_setor = ? AND su.ativo = 1 AND su.papel IN (${PAPEIS_CAN_APPROVE.map(() => '?').join(',')})
        AND u.ativo = 1${exclusion}`,
    params,
  );
  return rows.map((r) => ({ id: r.id_usuario, nome: r.nome, email: r.email }));
}

async function createApprovalFor(conn, { tipoEntidade, idEntidade, idSetor, idSolicitante }) {
  assertEntityType(tipoEntidade);

  const [flowRows] = await conn.query(
    `SELECT sf.niveis_exigidos
       FROM setor_fluxos sf
       JOIN setores s ON s.id = sf.id_setor
      WHERE sf.id_setor = ? AND sf.tipo_entidade = ?
        AND sf.ativo = 1 AND s.ativo = 1
      LIMIT 1`,
    [idSetor, tipoEntidade],
  );
  if (!flowRows.length) {
    throw new AppError('Setor não possui fluxo de aprovação ativo para este tipo de solicitação', 422);
  }
  const niveisExigidos = 1;

  try {
    const [result] = await conn.query(
      `INSERT INTO aprovacoes
         (tipo_entidade, id_entidade, id_setor, id_solicitante, nivel_atual, niveis_exigidos, status)
       VALUES (?, ?, ?, ?, 1, ?, 'PENDENTE')`,
      [tipoEntidade, idEntidade, idSetor, idSolicitante, niveisExigidos],
    );
    return { id: result.insertId, niveisExigidos, nivelAtual: 1 };
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      throw new AppError('Já existe uma aprovação pendente para esta solicitação', 409);
    }
    throw err;
  }
}

async function listPendingForUser(user, query = {}) {
  const userId = typeof user === 'object' ? user.id : user;
  const isAdmin = typeof user === 'object' ? !!user.is_super_admin : false;
  const { page, pageSize, offset } = parseListQuery(query);

  try {
    const serviceAccessService = require('../patrimonial/service-access.service');
    if (typeof serviceAccessService.repairOrphanApprovals === 'function') {
      await serviceAccessService.repairOrphanApprovals();
    }
  } catch {
    // best-effort: não bloqueia a listagem se o reparo falhar
  }

  let baseWhere;
  let params;

  if (isAdmin) {
    baseWhere = `
      FROM aprovacoes a
      JOIN setores s ON s.id = a.id_setor
      LEFT JOIN usuarios sol ON sol.id = a.id_solicitante
      ${ENTITY_SUMMARY_JOINS}
     WHERE a.status = 'PENDENTE'`;
    params = [];
  } else {
    const r4Filter = ALLOW_SAME_USER_MULTIPLE_LEVELS
      ? ''
      : `AND NOT EXISTS (
           SELECT 1 FROM aprovacao_decisoes ad
            WHERE ad.id_aprovacao = a.id AND ad.id_usuario = ?
         )`;

    baseWhere = `
      FROM aprovacoes a
      JOIN setores s ON s.id = a.id_setor
      JOIN setor_usuarios su
        ON su.id_setor = a.id_setor
       AND su.id_usuario = ?
       AND su.ativo = 1
       AND su.papel IN (${PAPEIS_CAN_APPROVE.map(() => '?').join(',')})
      LEFT JOIN usuarios sol ON sol.id = a.id_solicitante
      ${ENTITY_SUMMARY_JOINS}
     WHERE a.status = 'PENDENTE'
       ${r4Filter}`;

    params = ALLOW_SAME_USER_MULTIPLE_LEVELS
      ? [userId, ...PAPEIS_CAN_APPROVE]
      : [userId, ...PAPEIS_CAN_APPROVE, userId];
  }

  const [countRows] = await pool.query(`SELECT COUNT(*) AS total ${baseWhere}`, params);
  const [rows] = await pool.query(
    `SELECT a.*, s.nome AS setor_nome, sol.nome_completo AS solicitante_nome
            ${ENTITY_SUMMARY_SELECT}
      ${baseWhere}
      ORDER BY a.criado_em ASC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  const data = await attachLiberacaoResumo(rows.map(mapApprovalRow));
  return {
    data,
    pagination: { page, pageSize, total: countRows[0].total },
  };
}

async function listMine(userId, query = {}) {
  const { page, pageSize, offset } = parseListQuery(query);
  const params = [userId];
  let statusFilter = '';
  if (query.status && Object.values(STATUS).includes(query.status)) {
    statusFilter = 'AND a.status = ?';
    params.push(query.status);
  }

  const baseWhere = `
      FROM aprovacoes a
      JOIN setores s ON s.id = a.id_setor
      LEFT JOIN usuarios sol ON sol.id = a.id_solicitante
      ${ENTITY_SUMMARY_JOINS}
     WHERE a.id_solicitante = ? ${statusFilter}
       AND a.id = (
         SELECT MAX(a2.id)
           FROM aprovacoes a2
          WHERE a2.tipo_entidade = a.tipo_entidade
            AND a2.id_entidade = a.id_entidade
       )`;

  const [countRows] = await pool.query(`SELECT COUNT(*) AS total ${baseWhere}`, params);
  const [rows] = await pool.query(
    `SELECT a.*, s.nome AS setor_nome, sol.nome_completo AS solicitante_nome
            ${ENTITY_SUMMARY_SELECT}
      ${baseWhere}
      ORDER BY a.criado_em DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  const data = await attachLiberacaoResumo(rows.map(mapApprovalRow));
  return {
    data,
    pagination: { page, pageSize, total: countRows[0].total },
  };
}

/**
 * Total de solicitações da equipe (incluindo as do próprio usuário).
 * - Admin: todas
 * - Empresa (requires_company): mesmo id_company
 * - Interno: próprias + de quem compartilha setor ativo
 */
async function listTeam(user, query = {}) {
  const userId = typeof user === 'object' ? user.id : user;
  const isAdmin = typeof user === 'object' ? !!user.is_super_admin : false;
  const companyScoped = isCompanyScopedUser(user);
  const idCompany =
    typeof user === 'object' && user.id_company != null ? Number(user.id_company) : null;
  const { page, pageSize, offset } = parseListQuery(query);

  if (companyScoped && !isAdmin && !(Number.isFinite(idCompany) && idCompany > 0)) {
    return { data: [], pagination: { page, pageSize, total: 0 } };
  }

  const params = [];
  let teamFilter;

  if (isAdmin) {
    teamFilter = '1 = 1';
  } else if (companyScoped) {
    teamFilter = 'sol.id_company = ?';
    params.push(idCompany);
  } else {
    teamFilter = `(
        a.id_solicitante = ?
        OR EXISTS (
          SELECT 1
            FROM setor_usuarios su_me
            JOIN setor_usuarios su_peer
              ON su_peer.id_setor = su_me.id_setor
             AND su_peer.ativo = 1
             AND su_peer.id_usuario = a.id_solicitante
           WHERE su_me.id_usuario = ?
             AND su_me.ativo = 1
        )
      )`;
    params.push(userId, userId);
  }

  let statusFilter = '';
  if (query.status && Object.values(STATUS).includes(query.status)) {
    statusFilter = 'AND a.status = ?';
    params.push(query.status);
  }

  const baseWhere = `
      FROM aprovacoes a
      JOIN setores s ON s.id = a.id_setor
      LEFT JOIN usuarios sol ON sol.id = a.id_solicitante
      ${ENTITY_SUMMARY_JOINS}
     WHERE ${teamFilter} ${statusFilter}
       AND a.id = (
         SELECT MAX(a2.id)
           FROM aprovacoes a2
          WHERE a2.tipo_entidade = a.tipo_entidade
            AND a2.id_entidade = a.id_entidade
       )`;

  const [countRows] = await pool.query(`SELECT COUNT(*) AS total ${baseWhere}`, params);
  const [rows] = await pool.query(
    `SELECT a.*, s.nome AS setor_nome, sol.nome_completo AS solicitante_nome
            ${ENTITY_SUMMARY_SELECT}
      ${baseWhere}
      ORDER BY a.criado_em DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  const data = await attachLiberacaoResumo(rows.map(mapApprovalRow));
  return {
    data,
    pagination: { page, pageSize, total: countRows[0].total },
  };
}

async function getApprovalById(id, user) {
  const [rows] = await pool.query(
    `SELECT a.*, s.nome AS setor_nome, sol.nome_completo AS solicitante_nome
       FROM aprovacoes a
       JOIN setores s ON s.id = a.id_setor
       LEFT JOIN usuarios sol ON sol.id = a.id_solicitante
      WHERE a.id = ?`,
    [id],
  );
  if (!rows.length) throw new AppError('Aprovação não encontrada', 404);
  const aprovacao = rows[0];

  const isAdmin = !!user.is_super_admin;
  const isSolicitante = aprovacao.id_solicitante === user.id;
  let isMember = false;
  if (!isAdmin && !isSolicitante) {
    const [memberRows] = await pool.query(
      `SELECT 1 FROM setor_usuarios
        WHERE id_setor = ? AND id_usuario = ? AND ativo = 1 LIMIT 1`,
      [aprovacao.id_setor, user.id],
    );
    isMember = memberRows.length > 0;
  }
  if (!isAdmin && !isSolicitante && !isMember) {
    let isTeamPeer = false;
    if (isCompanyScopedUser(user) && Number(user.id_company) > 0) {
      const [peerRows] = await pool.query(
        `SELECT 1 FROM usuarios WHERE id = ? AND id_company = ? LIMIT 1`,
        [aprovacao.id_solicitante, Number(user.id_company)],
      );
      isTeamPeer = peerRows.length > 0;
    } else if (!isCompanyScopedUser(user)) {
      const [peerRows] = await pool.query(
        `SELECT 1
           FROM setor_usuarios su_me
           JOIN setor_usuarios su_peer
             ON su_peer.id_setor = su_me.id_setor
            AND su_peer.ativo = 1
            AND su_peer.id_usuario = ?
          WHERE su_me.id_usuario = ? AND su_me.ativo = 1
          LIMIT 1`,
        [aprovacao.id_solicitante, user.id],
      );
      isTeamPeer = peerRows.length > 0;
    }
    if (!isTeamPeer) {
      throw new AppError('Sem permissão para visualizar esta aprovação', 403);
    }
  }

  const [cycleRows] = await pool.query(
    `SELECT a.id, a.criado_em, a.status, a.finalizado_em, a.id_solicitante,
            sol.nome_completo AS solicitante_nome
       FROM aprovacoes a
       LEFT JOIN usuarios sol ON sol.id = a.id_solicitante
      WHERE a.tipo_entidade = ? AND a.id_entidade = ?
      ORDER BY a.criado_em ASC, a.id ASC`,
    [aprovacao.tipo_entidade, aprovacao.id_entidade],
  );

  const [decisionRows] = await pool.query(
    `SELECT ad.*, a.niveis_exigidos, u.nome_completo AS usuario_nome
       FROM aprovacao_decisoes ad
       INNER JOIN aprovacoes a ON a.id = ad.id_aprovacao
       LEFT JOIN usuarios u ON u.id = ad.id_usuario
      WHERE ad.id_aprovacao = ?
      ORDER BY ad.nivel ASC, ad.id ASC`,
    [id],
  );

  const [entityDecisionRows] = await pool.query(
    `SELECT ad.*, a.niveis_exigidos, u.nome_completo AS usuario_nome
       FROM aprovacao_decisoes ad
       INNER JOIN aprovacoes a ON a.id = ad.id_aprovacao
       LEFT JOIN usuarios u ON u.id = ad.id_usuario
      WHERE a.tipo_entidade = ? AND a.id_entidade = ?
      ORDER BY ad.decidido_em ASC, ad.id ASC`,
    [aprovacao.tipo_entidade, aprovacao.id_entidade],
  );

  const decisoes = decisionRows.map(mapDecisionRow);
  const decisoesHistorico = entityDecisionRows.map(mapDecisionRow);
  const mapped = mapApprovalRow(aprovacao);
  const entidade = await loadEntityForApproval(aprovacao.tipo_entidade, aprovacao.id_entidade, {
    approvalStatus: aprovacao.status,
  });
  const auditEvents = await loadEntityAuditEvents(aprovacao.tipo_entidade, aprovacao.id_entidade);
  const historico = buildHistorico({
    aprovacao,
    solicitante: mapped.solicitante,
    decisoes: decisoesHistorico,
    entidade,
    auditEvents,
    ciclos: cycleRows,
  });

  return {
    ...mapped,
    entidadeResumo: entidade
      ? { nome: entidade.nome, startDate: entidade.startDate, endDate: entidade.endDate }
      : mapped.entidadeResumo,
    liberacaoResumo: liberacaoResumoFromEntity(entidade, aprovacao.status),
    entidade,
    decisoes,
    historico,
  };
}

async function loadAndAssertCanDecide(conn, idAprovacao, user) {
  const [rows] = await conn.query(
    `SELECT * FROM aprovacoes WHERE id = ? FOR UPDATE`,
    [idAprovacao],
  );
  if (!rows.length) throw new AppError('Aprovação não encontrada', 404);
  const aprovacao = rows[0];

  if (aprovacao.status !== STATUS.PENDENTE) {
    const [dec] = await conn.query(
      `SELECT ad.decisao, u.nome_completo AS usuario_nome
         FROM aprovacao_decisoes ad
         LEFT JOIN usuarios u ON u.id = ad.id_usuario
        WHERE ad.id_aprovacao = ?
        ORDER BY ad.id DESC
        LIMIT 1`,
      [idAprovacao],
    );
    if (aprovacao.status === STATUS.EXPIRADO) {
      throw new AppError(
        'Tempo de autorização expirada. Esta solicitação não pode mais ser decidida porque o período solicitado já encerrou.',
        409,
      );
    }
    const who = dec[0]?.usuario_nome ? ` por ${dec[0].usuario_nome}` : '';
    const label =
      aprovacao.status === STATUS.APROVADO
        ? 'aprovada'
        : aprovacao.status === STATUS.REPROVADO
          ? 'reprovada'
          : aprovacao.status === STATUS.CANCELADO
            ? 'cancelada'
            : 'finalizada';
    throw new AppError(
      `Esta solicitação já foi ${label}${who}. Atualize a tela — não é possível uma nova decisão.`,
      409,
    );
  }

  if (!user.is_super_admin) {
    const [memberRows] = await conn.query(
      `SELECT su.papel
         FROM setor_usuarios su
         JOIN usuarios u ON u.id = su.id_usuario
        WHERE su.id_setor = ? AND su.id_usuario = ?
          AND su.ativo = 1 AND u.ativo = 1
        LIMIT 1`,
      [aprovacao.id_setor, user.id],
    );
    if (!memberRows.length || !PAPEIS_CAN_APPROVE.includes(memberRows[0].papel)) {
      throw new AppError('Usuário sem permissão para decidir esta aprovação', 403);
    }

    if (!ALLOW_SAME_USER_MULTIPLE_LEVELS) {
      const [priorRows] = await conn.query(
        `SELECT 1 FROM aprovacao_decisoes
          WHERE id_aprovacao = ? AND id_usuario = ? LIMIT 1`,
        [idAprovacao, user.id],
      );
      if (priorRows.length) {
        throw new AppError('Usuário já decidiu um nível desta aprovação', 409);
      }
    }
  }

  return aprovacao;
}

async function approve(idAprovacao, user, options = {}) {
  const comentario = typeof options === 'string' || options == null ? options : options.comentario;
  const approvedCollaboratorIds =
    typeof options === 'object' && options ? options.approvedCollaboratorIds : undefined;
  const approvedVehicleIds =
    typeof options === 'object' && options ? options.approvedVehicleIds : undefined;

  const conn = await pool.getConnection();
  let committed = false;
  try {
    await conn.beginTransaction();

    const aprovacao = await loadAndAssertCanDecide(conn, idAprovacao, user);
    if (await expireIfOverdue(conn, aprovacao)) {
      await conn.commit();
      committed = true;
      throw expirationDecisionError();
    }
    const nivel = aprovacao.nivel_atual;
    const isFinalLevel = nivel >= aprovacao.niveis_exigidos;

    let decisionMetadata = null;
    if (isFinalLevel && aprovacao.tipo_entidade === 'ACESSO_SERVICO') {
      decisionMetadata = await buildSelectiveApprovalMetadata(conn, aprovacao, {
        approvedCollaboratorIds,
        approvedVehicleIds,
      });
    }

    await conn.query(
      `INSERT INTO aprovacao_decisoes (id_aprovacao, nivel, id_usuario, decisao, comentario, metadata)
       VALUES (?, ?, ?, 'APROVADO', ?, ?)`,
      [
        idAprovacao,
        nivel,
        user.id,
        sanitizeComment(comentario),
        decisionMetadata ? JSON.stringify(decisionMetadata) : null,
      ],
    );

    if (isFinalLevel) {
      await conn.query(
        `UPDATE aprovacoes
            SET status = 'APROVADO', finalizado_em = NOW()
          WHERE id = ?`,
        [idAprovacao],
      );
      await runFinalizer(conn, aprovacao, STATUS.APROVADO, {
        approvedCollaboratorIds,
        approvedVehicleIds,
      });
    } else {
      await conn.query(
        `UPDATE aprovacoes SET nivel_atual = nivel_atual + 1 WHERE id = ?`,
        [idAprovacao],
      );
    }

    await conn.commit();
    committed = true;

    log.info(
      {
        idAprovacao,
        nivel,
        userId: user.id,
        finalizada: isFinalLevel,
        approvedCollaboratorIds,
        approvedVehicleIds,
      },
      'Nível aprovado',
    );

    return {
      id: idAprovacao,
      status: isFinalLevel ? STATUS.APROVADO : STATUS.PENDENTE,
      nivelDecidido: nivel,
      nivelAtual: isFinalLevel ? nivel : nivel + 1,
      niveisExigidos: aprovacao.niveis_exigidos,
      finalizada: isFinalLevel,
      approvedCollaboratorIds: Array.isArray(approvedCollaboratorIds)
        ? approvedCollaboratorIds
        : undefined,
      approvedVehicleIds: Array.isArray(approvedVehicleIds) ? approvedVehicleIds : undefined,
    };
  } catch (err) {
    if (!committed) await conn.rollback();
    if (err && err.code === 'ER_DUP_ENTRY') {
      throw new AppError(
        'Este nível já foi decidido por outro membro da equipe. Atualize a tela.',
        409,
      );
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function reject(idAprovacao, user, comentario) {
  const sanitized = sanitizeComment(comentario);
  if (!sanitized) {
    throw new AppError('Comentário é obrigatório ao reprovar', 422);
  }

  const conn = await pool.getConnection();
  let committed = false;
  try {
    await conn.beginTransaction();

    const aprovacao = await loadAndAssertCanDecide(conn, idAprovacao, user);
    if (await expireIfOverdue(conn, aprovacao)) {
      await conn.commit();
      committed = true;
      throw expirationDecisionError();
    }
    const nivel = aprovacao.nivel_atual;

    await conn.query(
      `INSERT INTO aprovacao_decisoes (id_aprovacao, nivel, id_usuario, decisao, comentario)
       VALUES (?, ?, ?, 'REPROVADO', ?)`,
      [idAprovacao, nivel, user.id, sanitized],
    );

    await conn.query(
      `UPDATE aprovacoes
          SET status = 'REPROVADO', finalizado_em = NOW()
        WHERE id = ?`,
      [idAprovacao],
    );

    await runFinalizer(conn, aprovacao, STATUS.REPROVADO);

    await conn.commit();
    committed = true;

    log.info({ idAprovacao, nivel, userId: user.id }, 'Solicitação reprovada');

    return {
      id: idAprovacao,
      status: STATUS.REPROVADO,
      nivelDecidido: nivel,
      finalizada: true,
    };
  } catch (err) {
    if (!committed) await conn.rollback();
    if (err && err.code === 'ER_DUP_ENTRY') {
      throw new AppError('Este nível já foi decidido por outro aprovador', 409);
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function cancel(idAprovacao, user, comentario) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT * FROM aprovacoes WHERE id = ? FOR UPDATE`,
      [idAprovacao],
    );
    if (!rows.length) throw new AppError('Aprovação não encontrada', 404);
    const aprovacao = rows[0];

    if (aprovacao.status !== STATUS.PENDENTE) {
      throw new AppError(`Aprovação já finalizada com status ${aprovacao.status}`, 409);
    }
    if (aprovacao.id_solicitante !== user.id && !user.is_super_admin) {
      throw new AppError('Apenas o solicitante ou um administrador pode cancelar', 403);
    }

    await conn.query(
      `UPDATE aprovacoes
          SET status = 'CANCELADO', finalizado_em = NOW()
        WHERE id = ?`,
      [idAprovacao],
    );

    await conn.commit();

    log.info({ idAprovacao, userId: user.id, comentario: sanitizeComment(comentario) }, 'Aprovação cancelada');
    return { id: idAprovacao, status: STATUS.CANCELADO, finalizada: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function countPendingForUser(user) {
  const userId = typeof user === 'object' ? user.id : user;
  const isAdmin = typeof user === 'object' ? !!user.is_super_admin : false;

  if (isAdmin) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total FROM aprovacoes WHERE status = 'PENDENTE'`,
    );
    return rows[0].total;
  }

  const r4Filter = ALLOW_SAME_USER_MULTIPLE_LEVELS
    ? ''
    : `AND NOT EXISTS (
         SELECT 1 FROM aprovacao_decisoes ad
          WHERE ad.id_aprovacao = a.id AND ad.id_usuario = ?
       )`;
  const params = ALLOW_SAME_USER_MULTIPLE_LEVELS
    ? [userId, ...PAPEIS_CAN_APPROVE]
    : [userId, ...PAPEIS_CAN_APPROVE, userId];

  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM aprovacoes a
       JOIN setor_usuarios su
         ON su.id_setor = a.id_setor
        AND su.id_usuario = ?
        AND su.ativo = 1
        AND su.papel IN (${PAPEIS_CAN_APPROVE.map(() => '?').join(',')})
      WHERE a.status = 'PENDENTE'
        ${r4Filter}`,
    params,
  );
  return rows[0].total;
}

module.exports = {
  ENTITY_TYPES,
  STATUS,
  PAPEIS_CAN_APPROVE,
  PAPEIS_CAN_OPEN,
  registerEntityFinalizer,
  listEligibleSectors,
  ensureActiveFlowsForTipo,
  assertUserCanOpenForSector,
  listEligibleApprovers,
  createApprovalFor,
  listPendingForUser,
  listMine,
  listTeam,
  getApprovalById,
  approve,
  reject,
  cancel,
  countPendingForUser,
  expireOverdueApprovals,
};
