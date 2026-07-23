const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const collaboratorService = require("./collaborator.service");
const {
  validateAndNormalizeCollaboratorPayload,
  validateSearchQuery,
  collaboratorStatusSchema,
  blacklistSchema,
  roleCreateSchema,
  roleUpdateSchema,
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

exports.createRole = async (req, res, next) => {
  try {
    const { error, value } = roleCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const role = await collaboratorService.createRole(value.description);

    attachAudit(req, {
      action: "CREATE",
      module: "collaborators",
      event: "collaborators.role_create",
      resource: { type: "collaborator_role", id: role.id_collaborator_role },
      metadata: { description: role.description },
    });

    res.status(201).json({ role });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("Já existe uma função com este nome.", 409));
    }
    next(err);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    const { error, value } = roleUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const role = await collaboratorService.updateRole(req.params.id, value.description);

    attachAudit(req, {
      action: "UPDATE",
      module: "collaborators",
      event: "collaborators.role_update",
      resource: { type: "collaborator_role", id: role.id_collaborator_role },
      metadata: { description: role.description },
    });

    res.json({ role });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("Já existe uma função com este nome.", 409));
    }
    next(err);
  }
};

exports.deleteRole = async (req, res, next) => {
  try {
    await collaboratorService.deleteRole(req.params.id);

    attachAudit(req, {
      action: "DELETE",
      module: "collaborators",
      event: "collaborators.role_delete",
      resource: { type: "collaborator_role", id: Number(req.params.id) },
    });

    res.json({ success: true });
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

exports.downloadBulkTemplate = async (req, res, next) => {
  try {
    const { sendXlsx } = require("../../utils/bulkTemplateXlsx");
    const file = await collaboratorService.getCollaboratorBulkTemplate();
    sendXlsx(res, file);
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

exports.bulkPreview = async (req, res, next) => {
  try {
    const result = await collaboratorService.previewBulkCollaborators(req, req.file);
    attachAudit(req, {
      action: "CREATE",
      module: "collaborators",
      event: "collaborators.bulk_preview",
      resource: { type: "collaborator_bulk", id: null },
      metadata: { previewToken: result.previewToken, resumo: result.resumo },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.bulkCommit = async (req, res, next) => {
  try {
    const result = await collaboratorService.commitBulkCollaborators(req, req.body || {});
    attachAudit(req, {
      action: "CREATE",
      module: "collaborators",
      event: "collaborators.bulk_commit",
      resource: { type: "collaborator_bulk", id: null },
      metadata: {
        colaboradores: result.colaboradores,
        veiculos: result.veiculos,
      },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.uploadPicture = async (req, res, next) => {
  try {
    const path = require("path");
    const fs = require("fs");
    const { v4: uuidv4 } = require("uuid");
    const { validarFoto } = require("../faces/facial.validator");
    const AppError = require("../../utils/AppError");

    const report = await validarFoto(req.file.buffer, { includeMeta: true });
    const aptoControlId = !!report.apto?.controlid;
    const aptoDahua = !!report.apto?.dahua;

    if (!aptoControlId || !aptoDahua) {
      const falhas = (report.checagens || []).filter((c) => c.status === "falha");
      const summary =
        falhas
          .map((c) => c.mensagem || c.id)
          .filter(Boolean)
          .slice(0, 5)
          .join(" ") || "A foto não atende aos requisitos faciais.";

      throw new AppError(
        `Foto rejeitada pela validação facial. Control iD: ${aptoControlId ? "apto" : "inapto"}; Dahua: ${aptoDahua ? "apto" : "inapto"}. ${summary}`,
        400,
        true,
        { faceValidation: report },
      );
    }

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

    res.json({ collaborator, picture: filename, faceValidation: report });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const validated = await validateAndNormalizeCollaboratorPayload(req.body);
    if (validated.error) throw new AppError(validated.error, 400);

    const { collaborator, linked } = await collaboratorService.createCollaborator(
      req,
      validated.value,
    );

    attachAudit(req, {
      action: linked ? "UPDATE" : "CREATE",
      module: "collaborators",
      event: linked ? "collaborator.link_company" : "collaborator.create",
      resource: {
        type: "collaborator",
        id: collaborator.id_collaborator,
        document: collaboratorService.maskDocumentForAudit(collaborator),
      },
      changes: {
        name: collaborator.name,
        id_collaborator_document_type: collaborator.id_collaborator_document_type,
        id_collaborator_role: collaborator.id_collaborator_role,
        linked: !!linked,
      },
    });

    res.status(linked ? 200 : 201).json({ collaborator, linked: !!linked });
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

exports.deleteCollaborator = async (req, res, next) => {
  try {
    const existing = await collaboratorService.findCollaboratorById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Colaborador não encontrado." });
    }

    const result = await collaboratorService.deleteCollaborator(req, req.params.id);

    attachAudit(req, {
      action: "DELETE",
      module: "collaborators",
      event: result.unlinked ? "collaborator.unlink_company" : "collaborator.delete",
      resource: {
        type: "collaborator",
        id: Number(req.params.id),
        document: collaboratorService.maskDocumentForAudit(existing),
      },
      metadata: { alertLevel: "critical", unlinked: !!result.unlinked },
    });

    res.json({ success: true, unlinked: !!result.unlinked });
  } catch (err) {
    next(err);
  }
};
