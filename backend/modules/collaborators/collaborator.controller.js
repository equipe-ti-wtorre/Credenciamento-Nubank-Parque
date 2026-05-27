const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const collaboratorService = require("./collaborator.service");
const {
  validateAndNormalizeCollaboratorPayload,
  validateSearchQuery,
  collaboratorStatusSchema,
  blacklistSchema,
} = require("./collaborator.schema");

exports.listTypes = async (req, res, next) => {
  try {
    const types = await collaboratorService.listDocumentTypes();
    res.json({ types });
  } catch (err) {
    next(err);
  }
};

exports.listRoles = async (req, res, next) => {
  try {
    const roles = await collaboratorService.listRoles();
    res.json({ roles });
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const { page, limit } = collaboratorService.parseListQuery(req.query);
    const filters = collaboratorService.parseListFilters(req.query);
    const result = await collaboratorService.listCollaborators(req, {
      page,
      limit,
      filters,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.search = async (req, res, next) => {
  try {
    const validated = await validateSearchQuery(req.query);
    if (validated.error) throw new AppError(validated.error, 400);

    const result = await collaboratorService.searchByDocument(req, validated.value);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const collaborator = await collaboratorService.getCollaboratorById(
      req,
      req.params.id,
    );
    res.json({ collaborator });
  } catch (err) {
    next(err);
  }
};

exports.bulkCreate = async (req, res, next) => {
  try {
    const summary = await collaboratorService.bulkCreateCollaborators(req, req.file);

    attachAudit(req, {
      action: "CREATE",
      module: "collaborators",
      event: "collaborators.bulk_create",
      resource: { type: "collaborator_bulk", id: null },
      metadata: {
        totalProcessed: summary.totalProcessed,
        successCount: summary.successCount,
        errorCount: summary.errors.length,
      },
    });

    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
};

exports.uploadPicture = async (req, res, next) => {
  try {
    const path = require("path");
    const fs = require("fs");
    const { v4: uuidv4 } = require("uuid");
    const storageDir = path.join(__dirname, "../../storage/pictures");
    fs.mkdirSync(storageDir, { recursive: true });

    const ext = path.extname(req.file.originalname || ".jpg").toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    const filename = `${uuidv4()}${safeExt}`;
    fs.writeFileSync(path.join(storageDir, filename), req.file.buffer);

    const collaborator = await collaboratorService.updateCollaboratorPicture(
      req.params.id,
      filename,
    );

    attachAudit(req, {
      action: "UPDATE",
      module: "collaborators",
      event: "collaborator.picture.upload",
      resource: { type: "collaborator", id: collaborator.id_collaborator },
    });

    res.json({ collaborator, picture: filename });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const validated = await validateAndNormalizeCollaboratorPayload(req.body);
    if (validated.error) throw new AppError(validated.error, 400);

    const collaborator = await collaboratorService.createCollaborator(
      req,
      validated.value,
    );

    attachAudit(req, {
      action: "CREATE",
      module: "collaborators",
      event: "collaborator.create",
      resource: {
        type: "collaborator",
        id: collaborator.id_collaborator,
        document: collaboratorService.maskDocumentForAudit(collaborator),
      },
      changes: {
        name: collaborator.name,
        id_collaborator_document_type: collaborator.id_collaborator_document_type,
        id_collaborator_role: collaborator.id_collaborator_role,
      },
    });

    res.status(201).json({ collaborator });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("Colaborador já cadastrado com este documento.", 409));
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const validated = await validateAndNormalizeCollaboratorPayload(req.body, {
      isUpdate: true,
    });
    if (validated.error) throw new AppError(validated.error, 400);

    const collaborator = await collaboratorService.updateCollaborator(
      req,
      req.params.id,
      validated.value,
    );

    const changes = { ...validated.value };
    if (changes.document) {
      changes.document = collaboratorService.maskDocumentForAudit(collaborator);
    }

    attachAudit(req, {
      action: "UPDATE",
      module: "collaborators",
      event: "collaborator.update",
      resource: {
        type: "collaborator",
        id: collaborator.id_collaborator,
        document: collaboratorService.maskDocumentForAudit(collaborator),
      },
      changes,
    });

    res.json({ collaborator });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("Colaborador já cadastrado com este documento.", 409));
    }
    next(err);
  }
};

exports.patchStatus = async (req, res, next) => {
  try {
    const { error, value } = collaboratorStatusSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { collaborator, changes } = await collaboratorService.updateCollaboratorStatus(
      req.params.id,
      value.status,
    );

    let action = "UPDATE";
    if (changes.wasDeactivated) action = "DEACTIVATE";
    else if (changes.wasActivated) action = "ACTIVATE";

    attachAudit(req, {
      action,
      module: "collaborators",
      event: `collaborator.${action.toLowerCase()}`,
      resource: {
        type: "collaborator",
        id: collaborator.id_collaborator,
        document: collaboratorService.maskDocumentForAudit(collaborator),
      },
      changes: { status: collaborator.status, ...changes },
    });

    res.json({ collaborator });
  } catch (err) {
    next(err);
  }
};

exports.addBlacklist = async (req, res, next) => {
  try {
    const { error, value } = blacklistSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const collaborator = await collaboratorService.addToBlacklist(
      req.params.id,
      value.reason,
      req.user?.id,
    );

    attachAudit(req, {
      action: "CREATE",
      module: "collaborators",
      event: "collaborator.blacklist.add",
      resource: {
        type: "collaborator",
        id: collaborator.id_collaborator,
        document: collaboratorService.maskDocumentForAudit(collaborator),
      },
      changes: { reason: value.reason },
      metadata: { alertLevel: "critical", reason: value.reason },
    });

    res.status(201).json({ collaborator });
  } catch (err) {
    next(err);
  }
};

exports.removeBlacklist = async (req, res, next) => {
  try {
    const collaborator = await collaboratorService.removeFromBlacklist(req.params.id);

    attachAudit(req, {
      action: "DELETE",
      module: "collaborators",
      event: "collaborator.blacklist.remove",
      resource: {
        type: "collaborator",
        id: collaborator.id_collaborator,
        document: collaboratorService.maskDocumentForAudit(collaborator),
      },
      metadata: { alertLevel: "critical" },
    });

    res.json({ collaborator });
  } catch (err) {
    next(err);
  }
};
