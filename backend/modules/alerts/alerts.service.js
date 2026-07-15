const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { child } = require("../../config/logger");

const log = child({ module: "alerts" });

function mapAlertRow(row) {
  return {
    id: Number(row.id),
    tipo: row.tipo,
    titulo: row.titulo,
    mensagem: row.mensagem,
    link: row.link || null,
    tipoReferencia: row.tipo_referencia || null,
    idReferencia: row.id_referencia != null ? Number(row.id_referencia) : null,
    lidaEm: row.lida_em || null,
    criadoEm: row.criado_em,
  };
}

async function createAlert({
  idUsuario,
  tipo,
  titulo,
  mensagem,
  link = null,
  tipoReferencia = null,
  idReferencia = null,
}) {
  if (!idUsuario || !tipo || !titulo || !mensagem) {
    throw new AppError("Dados incompletos para criar alerta.", 400);
  }

  const [result] = await db.execute(
    `INSERT INTO alertas (
       id_usuario, tipo, titulo, mensagem, link, tipo_referencia, id_referencia
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      idUsuario,
      String(tipo).slice(0, 80),
      String(titulo).slice(0, 200),
      String(mensagem).slice(0, 1000),
      link ? String(link).slice(0, 255) : null,
      tipoReferencia ? String(tipoReferencia).slice(0, 80) : null,
      idReferencia != null ? Number(idReferencia) : null,
    ],
  );

  return { id: result.insertId };
}

async function createAlertsForUsers(userIds, payload) {
  const uniqueIds = [...new Set((userIds || []).map(Number).filter((id) => id > 0))];
  if (!uniqueIds.length) return { created: 0 };

  let created = 0;
  for (const idUsuario of uniqueIds) {
    try {
      await createAlert({ ...payload, idUsuario });
      created += 1;
    } catch (err) {
      log.warn({ err, idUsuario, tipo: payload?.tipo }, "Falha ao criar alerta");
    }
  }
  return { created };
}

async function listUsersWithPermission(modulo, acao, { excludeUserIds = [] } = {}) {
  const params = [modulo, acao];
  let exclusion = "";
  if (excludeUserIds.length) {
    exclusion = ` AND u.id NOT IN (${excludeUserIds.map(() => "?").join(",")})`;
    params.push(...excludeUserIds);
  }

  const [rows] = await db.execute(
    `SELECT DISTINCT u.id
       FROM usuarios u
       INNER JOIN perfis p ON p.id = u.id_perfil
       LEFT JOIN perfil_permissoes pp ON pp.id_perfil = p.id
      WHERE u.ativo = 1
        AND (
          p.is_super_admin = 1
          OR (pp.modulo = ? AND pp.acao = ?)
        )${exclusion}`,
    params,
  );
  return rows.map((r) => Number(r.id));
}

async function alertExistsForRef(userId, tipoReferencia, idReferencia) {
  const [rows] = await db.execute(
    `SELECT id FROM alertas
      WHERE id_usuario = ? AND tipo_referencia = ? AND id_referencia = ?
      LIMIT 1`,
    [userId, tipoReferencia, idReferencia],
  );
  return rows.length > 0;
}

/**
 * Materializa aprovações pendentes (badge da sidebar) como alertas in-app
 * para o usuário atual — cobre itens criados antes do feed existir.
 */
async function syncPendingApprovalsForUser(user) {
  if (!user?.id) return { created: 0 };
  try {
    const approvalsService = require("../approvals/approvals.service");
    const { data } = await approvalsService.listPendingForUser(user, {
      page: 1,
      pageSize: 100,
    });

    let created = 0;
    for (const item of data || []) {
      if (await alertExistsForRef(user.id, "aprovacao", item.id)) continue;

      const tipoLabel = item.tipoEntidade === "EVENTO" ? "Evento" : "Acesso de serviço";
      const nome = item.entidadeResumo?.nome;
      const setor = item.setor?.nome || "—";
      const mensagem = nome
        ? `${tipoLabel}: ${nome} — setor ${setor}. Aguardando sua aprovação.`
        : `${tipoLabel} #${item.idEntidade} — setor ${setor}. Aguardando sua aprovação.`;

      await createAlert({
        idUsuario: user.id,
        tipo: "approvals.created",
        titulo: "Aprovação pendente",
        mensagem,
        link: "/aprovacoes",
        tipoReferencia: "aprovacao",
        idReferencia: item.id,
      });
      created += 1;
    }
    return { created };
  } catch (err) {
    log.warn({ err, userId: user.id }, "Falha ao sincronizar aprovações pendentes em alertas");
    return { created: 0 };
  }
}

/**
 * Materializa solicitações de documento pendentes para aprovadores.
 */
async function syncPendingDocumentChangesForUser(user) {
  if (!user?.id) return { created: 0 };
  try {
    const { hasPermission, isSuperAdmin } = require("../../utils/permissions");
    if (!isSuperAdmin(user) && !hasPermission(user, "document_approvals", "edit")) {
      return { created: 0 };
    }

    const documentChangeService = require("../collaborators/document-change.service");
    const requests = await documentChangeService.listPendingDocumentChanges();
    let created = 0;
    for (const request of requests || []) {
      if (await alertExistsForRef(user.id, "document_change_request", request.id)) continue;
      if (request.id_usuario_requester && Number(request.id_usuario_requester) === Number(user.id)) {
        continue;
      }

      const nome = request.collaborator_name || "colaborador";
      await createAlert({
        idUsuario: user.id,
        tipo: "document_change.requested",
        titulo: "Alteração de documento pendente",
        mensagem: `Solicitação de alteração de documento para ${nome} aguardando análise.`,
        link: "/admin/aprovacoes-documento",
        tipoReferencia: "document_change_request",
        idReferencia: request.id,
      });
      created += 1;
    }
    return { created };
  } catch (err) {
    log.warn({ err, userId: user.id }, "Falha ao sincronizar documentos pendentes em alertas");
    return { created: 0 };
  }
}

async function syncInboxAlertsForUser(user) {
  const a = await syncPendingApprovalsForUser(user);
  const d = await syncPendingDocumentChangesForUser(user);
  return { created: (a.created || 0) + (d.created || 0) };
}

async function listAlerts(userId, { page = 1, pageSize = 20, unreadOnly = false } = {}) {
  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const params = [userId];
  let unreadClause = "";
  if (unreadOnly) {
    unreadClause = " AND lida_em IS NULL";
  }

  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM alertas WHERE id_usuario = ?${unreadClause}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await db.execute(
    `SELECT * FROM alertas
      WHERE id_usuario = ?${unreadClause}
      ORDER BY criado_em DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return {
    data: rows.map(mapAlertRow),
    pagination: {
      page: Math.max(Number(page) || 1, 1),
      pageSize: limit,
      total,
    },
  };
}

async function countUnread(userId) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS total FROM alertas WHERE id_usuario = ? AND lida_em IS NULL`,
    [userId],
  );
  return Number(rows[0]?.total ?? 0);
}

async function markRead(userId, alertId) {
  const [rows] = await db.execute(
    `SELECT * FROM alertas WHERE id = ? AND id_usuario = ? LIMIT 1`,
    [alertId, userId],
  );
  if (!rows[0]) throw new AppError("Alerta não encontrado.", 404);
  if (rows[0].lida_em) {
    return mapAlertRow(rows[0]);
  }

  await db.execute(
    `UPDATE alertas SET lida_em = NOW() WHERE id = ? AND id_usuario = ? AND lida_em IS NULL`,
    [alertId, userId],
  );

  const [updated] = await db.execute(
    `SELECT * FROM alertas WHERE id = ? AND id_usuario = ? LIMIT 1`,
    [alertId, userId],
  );
  return mapAlertRow(updated[0]);
}

async function markAllRead(userId) {
  const [result] = await db.execute(
    `UPDATE alertas SET lida_em = NOW() WHERE id_usuario = ? AND lida_em IS NULL`,
    [userId],
  );
  return { updated: result.affectedRows || 0 };
}

module.exports = {
  createAlert,
  createAlertsForUsers,
  listUsersWithPermission,
  syncInboxAlertsForUser,
  listAlerts,
  countUnread,
  markRead,
  markAllRead,
};
