const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const approvalsService = require("./approvals.service");
const { approveSchema, rejectSchema, cancelSchema } = require("./approvals.schema");
const { notifyApprovalCreated, notifyApprovalAdvanced, notifyApprovalFinalized } = require("./approvals.notifications");

exports.listPending = async (req, res, next) => {
  try {
    const result = await approvalsService.listPendingForUser(req.user, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.countPending = async (req, res, next) => {
  try {
    const total = await approvalsService.countPendingForUser(req.user);
    res.json({ total });
  } catch (err) {
    next(err);
  }
};

exports.listMine = async (req, res, next) => {
  try {
    const result = await approvalsService.listMine(req.user.id, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.listEligibleSectors = async (req, res, next) => {
  try {
    const sectors = await approvalsService.listEligibleSectors(req.params.tipoEntidade, req.user);
    res.json({ sectors });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const approval = await approvalsService.getApprovalById(req.params.id, req.user);
    res.json({ approval });
  } catch (err) {
    next(err);
  }
};

exports.approve = async (req, res, next) => {
  try {
    const { error, value } = approveSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await approvalsService.approve(req.params.id, req.user, value);

    attachAudit(req, {
      action: "APPROVE",
      module: "approvals",
      event: "approvals.approve",
      resource: { type: "approval", id: Number(req.params.id) },
      metadata: {
        idAprovacao: Number(req.params.id),
        nivel: result.nivelDecidido,
        decisao: "APROVADO",
        finalizada: result.finalizada,
        approvedCollaboratorIds: result.approvedCollaboratorIds,
        approvedVehicleIds: result.approvedVehicleIds,
      },
    });

    res.json({ result });

    setImmediate(() => {
      void notifyApprovalAdvanced(result, req.user.id).catch(() => {});
    });
  } catch (err) {
    next(err);
  }
};

exports.reject = async (req, res, next) => {
  try {
    const { error, value } = rejectSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 422);

    const result = await approvalsService.reject(req.params.id, req.user, value.comentario);

    attachAudit(req, {
      action: "REJECT",
      module: "approvals",
      event: "approvals.reject",
      resource: { type: "approval", id: Number(req.params.id) },
      metadata: {
        idAprovacao: Number(req.params.id),
        nivel: result.nivelDecidido,
        decisao: "REPROVADO",
      },
    });

    res.json({ result });

    setImmediate(() => {
      void notifyApprovalFinalized(req.params.id, "REPROVADO", value.comentario).catch(() => {});
    });
  } catch (err) {
    next(err);
  }
};

exports.cancel = async (req, res, next) => {
  try {
    const { error, value } = cancelSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await approvalsService.cancel(req.params.id, req.user, value.comentario);

    attachAudit(req, {
      action: "CANCEL",
      module: "approvals",
      event: "approvals.cancel",
      resource: { type: "approval", id: Number(req.params.id) },
      metadata: {
        idAprovacao: Number(req.params.id),
        decisao: "CANCELADO",
      },
    });

    res.json({ result });
  } catch (err) {
    next(err);
  }
};
