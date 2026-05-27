const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const serviceAccessService = require("./service-access.service");
const {
  serviceAccessCreateSchema,
  serviceAccessStatusSchema,
} = require("./service-access.schema");

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = await serviceAccessService.listServiceAccess(req, { page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const service = await serviceAccessService.getServiceAccessById(req, req.params.id);
    res.json({ service });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = serviceAccessCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const service = await serviceAccessService.createServiceAccess(req, value);
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "service_access.create",
      resource: { type: "service_access", id: service.id_service_access },
    });
    res.status(201).json({ service });
  } catch (err) {
    next(err);
  }
};

exports.patchStatus = async (req, res, next) => {
  try {
    const { error, value } = serviceAccessStatusSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const service = await serviceAccessService.updateServiceAccessStatus(
      req,
      req.params.id,
      value,
    );
    attachAudit(req, {
      action: "UPDATE",
      module: "patrimonial",
      event: "service_access.status",
      resource: { type: "service_access", id: service.id_service_access },
      changes: { id_access_status: value.id_access_status },
    });
    res.json({ service });
  } catch (err) {
    next(err);
  }
};
