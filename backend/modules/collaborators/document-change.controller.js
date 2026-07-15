const Joi = require("joi");
const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const { child } = require("../../config/logger");
const documentChangeService = require("./document-change.service");
const alertsService = require("../alerts/alerts.service");

const log = child({ module: "document-change.notifications" });

const createSchema = Joi.object({
  new_document: Joi.string().required(),
  reason: Joi.string().min(10).max(500).required(),
});

const statusSchema = Joi.object({
  status: Joi.string().valid("APPROVED", "REJECTED").required(),
  admin_reason: Joi.string().max(500).allow("", null).optional(),
});

async function notifyDocumentChangeRequested(request, requesterId) {
  try {
    const userIds = await alertsService.listUsersWithPermission("document_approvals", "edit", {
      excludeUserIds: requesterId ? [requesterId] : [],
    });
    const nome = request.collaborator_name || "colaborador";
    await alertsService.createAlertsForUsers(userIds, {
      tipo: "document_change.requested",
      titulo: "Alteração de documento pendente",
      mensagem: `Solicitação de alteração de documento para ${nome} aguardando análise.`,
      link: "/admin/aprovacoes-documento",
      tipoReferencia: "document_change_request",
      idReferencia: request.id,
    });
  } catch (err) {
    log.warn({ err, id: request?.id }, "Falha ao criar alertas de alteração de documento");
  }
}

async function notifyDocumentChangeResolved(request) {
  try {
    if (!request.id_usuario_requester) return;
    const approved = request.status === "APPROVED";
    const nome = request.collaborator_name || "colaborador";
    await alertsService.createAlert({
      idUsuario: request.id_usuario_requester,
      tipo: "document_change.resolved",
      titulo: approved ? "Alteração de documento aprovada" : "Alteração de documento rejeitada",
      mensagem: approved
        ? `Sua solicitação de alteração de documento para ${nome} foi aprovada.`
        : `Sua solicitação de alteração de documento para ${nome} foi rejeitada.`,
      link: "/admin/aprovacoes-documento",
      tipoReferencia: "document_change_request",
      idReferencia: request.id,
    });
  } catch (err) {
    log.warn({ err, id: request?.id }, "Falha ao criar alerta de resolução de documento");
  }
}

exports.create = async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const request = await documentChangeService.createDocumentChangeRequest(
      req,
      req.params.id,
      value,
    );
    attachAudit(req, {
      action: "CREATE",
      module: "collaborators",
      event: "collaborators.document_change.request",
      resource: { type: "document_change_request", id: request.id },
    });
    setImmediate(() => {
      notifyDocumentChangeRequested(request, req.user?.id);
    });
    res.status(201).json({ request });
  } catch (err) {
    next(err);
  }
};

exports.listPending = async (req, res, next) => {
  try {
    const requests = await documentChangeService.listPendingDocumentChanges();
    res.json({ requests });
  } catch (err) {
    next(err);
  }
};

exports.countPending = async (req, res, next) => {
  try {
    const total = await documentChangeService.countPendingDocumentChanges();
    res.json({ total });
  } catch (err) {
    next(err);
  }
};

exports.patchStatus = async (req, res, next) => {
  try {
    const { error, value } = statusSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const request = await documentChangeService.updateDocumentChangeStatus(
      req,
      req.params.id,
      value,
    );
    attachAudit(req, {
      action: "UPDATE",
      module: "collaborators",
      event: `collaborators.document_change.${value.status.toLowerCase()}`,
      resource: { type: "document_change_request", id: request.id },
      changes: value,
    });
    setImmediate(() => {
      notifyDocumentChangeResolved(request);
    });
    res.json({ request });
  } catch (err) {
    next(err);
  }
};
