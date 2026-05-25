const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const credentialsService = require("./credentials.service");
const {
  credentialCreateSchema,
  credentialStatusSchema,
} = require("./credentials.schema");

exports.list = async (req, res, next) => {
  try {
    const { page, limit } = credentialsService.parseListQuery(req.query);
    const filters = credentialsService.parseListFilters(req.query);
    const result = await credentialsService.listCredentials(req, { page, limit, filters });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const credential = await credentialsService.getCredentialById(req, req.params.id);
    res.json({ credential });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = credentialCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const credential = await credentialsService.createCredential(req, value);

    attachAudit(req, {
      action: "CREATE",
      module: "credentials",
      event: "credentials.request",
      resource: {
        type: "credential",
        id: credential.id_event_day_company_collaborator,
        id_event: credential.event.id_event,
        id_collaborator: credential.id_collaborator,
      },
      changes: {
        id_access_status: credential.id_access_status,
        id_event_day_company: credential.id_event_day_company,
      },
    });

    res.status(201).json({ credential });
  } catch (err) {
    next(err);
  }
};

exports.patchStatus = async (req, res, next) => {
  try {
    const { error, value } = credentialStatusSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { credential, auditChanges } = await credentialsService.updateCredentialStatus(
      req,
      req.params.id,
      value,
    );

    attachAudit(req, {
      action: "UPDATE",
      module: "credentials",
      event: "credentials.status_update",
      resource: {
        type: "credential",
        id: credential.id_event_day_company_collaborator,
      },
      changes: auditChanges,
    });

    res.json({ credential });
  } catch (err) {
    next(err);
  }
};
