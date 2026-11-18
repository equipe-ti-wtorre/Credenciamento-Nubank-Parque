const AppError = require("../utils/AppError");
const { buildCompanyScope } = require("../utils/permissions");

async function vinculoEvento(req) {
  const eventService = require("../modules/events/event.service");
  let id = Number(req.recurso?.id_event || 0);
  if (!id && req.recursos?.id_event_day) id = Number(req.recursos.id_event_day.id_event || 0);
  if (!id && req.recursos?.id_event_day_company) {
    const db = require("../config/db");
    const [rows] = await db.execute(
      "SELECT id_event FROM event_day WHERE id_event_day = ? LIMIT 1",
      [req.recursos.id_event_day_company.id_event_day],
    );
    id = Number(rows[0]?.id_event || 0);
  }
  if (!id) return;
  await eventService.assertCanReadEvent(req, id);
}

async function vinculoCredenciamento(req) {
  const service = require("../modules/event-accreditation/event-accreditation.service");
  const row = req.recurso;
  if (!row) return;
  await service.assertCanRead(req, row);
}

async function vinculoAcessoServico(req) {
  if (!req.recurso) return;
  if (!req.user?.requires_company && !req.user?.profile?.requires_company) return;
  const service = require("../modules/patrimonial/service-access.service");
  await service.assertServiceInScope(req, req.recurso);
}

async function vinculoEmpresa(req) {
  const row = req.recurso;
  if (!row) return;
  const scope = buildCompanyScope(req.user);
  if (scope.mode === "admin") return;
  const own = scope.onlyCompanyId ?? scope.ownCompanyId;
  if (Number(row.id_company) !== Number(own)) {
    throw new AppError("Empresa não encontrada.", 404);
  }
}

async function vinculoColaborador(req) {
  const row = req.recurso;
  if (!row) return;
  if (!req.user?.requires_company) return;
  const companyId = req.user.id_company != null ? Number(req.user.id_company) : null;
  if (!companyId) throw new AppError("Colaborador não encontrado.", 404);
  const db = require("../config/db");
  const [rows] = await db.execute(
    `SELECT 1 FROM company_collaborator
      WHERE id_collaborator = ? AND id_company = ? LIMIT 1`,
    [row.id_collaborator, companyId],
  );
  if (!rows.length && Number(row.id_company) !== companyId) {
    throw new AppError("Colaborador não encontrado.", 404);
  }
}

async function vinculoUsuario(req) {
  const row = req.recurso;
  if (!row || !req.user?.requires_company) return;
  if (Number(row.id_company) !== Number(req.user.id_company)) {
    throw new AppError("Usuário não encontrado.", 404);
  }
}

async function vinculoAprovacao(req) {
  const service = require("../modules/approvals/approvals.service");
  const id = Number(req.recurso?.id ?? req.params.id);
  await service.getApprovalById(id, req.user);
}

async function vinculoAlerta(req) {
  const row = req.recurso;
  if (!row) return;
  if (req.user?.is_super_admin) return;
  if (Number(row.id_usuario) !== Number(req.user?.id)) {
    throw new AppError("Alerta não encontrado.", 404);
  }
}

async function vinculoCredencial(req) {
  const row = req.recurso;
  if (!row || row.id_company == null) return;
  const service = require("../modules/credentials/credentials.service");
  await service.assertCredentialInScope(req, row);
}

module.exports = {
  vinculoEvento,
  vinculoCredenciamento,
  vinculoAcessoServico,
  vinculoEmpresa,
  vinculoColaborador,
  vinculoUsuario,
  vinculoAprovacao,
  vinculoAlerta,
  vinculoCredencial,
};
