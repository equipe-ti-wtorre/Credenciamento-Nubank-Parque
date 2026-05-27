const Joi = require("joi");
const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const documentChangeService = require("./document-change.service");

const createSchema = Joi.object({
  new_document: Joi.string().required(),
  reason: Joi.string().min(10).max(500).required(),
});

const statusSchema = Joi.object({
  status: Joi.string().valid("APPROVED", "REJECTED").required(),
  admin_reason: Joi.string().max(500).allow("", null).optional(),
});

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
    res.json({ request });
  } catch (err) {
    next(err);
  }
};
