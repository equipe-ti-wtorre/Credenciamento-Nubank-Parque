const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const serviceAccessService = require("./service-access.service");
const { notifyApprovalCreated } = require("../approvals/approvals.notifications");
const {
  serviceAccessCreateSchema,
  serviceAccessUpdateSchema,
  serviceAccessPeriodSchema,
  serviceAccessStatusSchema,
  serviceAccessEnabledSchema,
  serviceAccessCollaboratorSchema,
  serviceAccessVehicleSchema,
  serviceAccessRelationsSchema,
} = require("./service-access.schema");

function scheduleApprovalNotify(req, service) {
  const idAprovacao = service?.id_aprovacao;
  const idSetor = service?.id_setor;
  if (!idAprovacao || !idSetor) return;
  if (service.aprovacao_status && service.aprovacao_status !== "PENDENTE") return;
  setImmediate(() => {
    void notifyApprovalCreated({
      idAprovacao,
      idSetor,
      idSolicitante: req.user.id,
    }).catch(() => {});
  });
}

async function notifyServiceIfPending(req, id) {
  try {
    const service = await serviceAccessService.getServiceAccessById(req, id);
    scheduleApprovalNotify(req, service);
  } catch {
    /* best-effort */
  }
}

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filters = {
      finalidade: req.query.finalidade,
      requesting_department: req.query.requesting_department,
      id_access_status: req.query.id_access_status,
      status: req.query.status,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
    };
    const result = await serviceAccessService.listServiceAccess(req, { page, limit, filters });
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
    const { approvalCreated, ...servicePayload } = service;
    res.status(201).json({ service: servicePayload });

    if (approvalCreated) {
      scheduleApprovalNotify(req, {
        id_aprovacao: approvalCreated.id,
        id_setor: value.id_setor,
        aprovacao_status: "PENDENTE",
      });
    }
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { error, value } = serviceAccessUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const service = await serviceAccessService.updateServiceAccess(req, req.params.id, value);
    const { approvalNotify, contentChanged, ...servicePayload } = service;
    attachAudit(req, {
      action: "UPDATE",
      module: "patrimonial",
      event: "service_access.update",
      resource: { type: "service_access", id: servicePayload.id_service_access },
      changes: value,
    });
    res.json({ service: servicePayload });
    if (approvalNotify) {
      scheduleApprovalNotify(req, servicePayload);
    }
  } catch (err) {
    next(err);
  }
};

exports.syncRelations = async (req, res, next) => {
  try {
    const { error, value } = serviceAccessRelationsSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const service = await serviceAccessService.syncServiceAccessRelations(
      req,
      req.params.id,
      value,
    );
    const { approvalNotify, relationsChanged, ...servicePayload } = service;
    attachAudit(req, {
      action: "UPDATE",
      module: "patrimonial",
      event: "service_access.relations.sync",
      resource: { type: "service_access", id: servicePayload.id_service_access },
      metadata: {
        relationsChanged: !!relationsChanged,
        collaborators: value.collaborators.length,
        vehicles: value.vehicles.length,
      },
    });
    res.json({ service: servicePayload, relationsChanged: !!relationsChanged });
    if (approvalNotify) {
      scheduleApprovalNotify(req, servicePayload);
    }
  } catch (err) {
    next(err);
  }
};

exports.patchPeriod = async (req, res, next) => {
  try {
    const { error, value } = serviceAccessPeriodSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const service = await serviceAccessService.updateServiceAccessPeriod(
      req,
      req.params.id,
      value,
    );
    attachAudit(req, {
      action: "UPDATE",
      module: "patrimonial",
      event: "service_access.period_change",
      resource: { type: "service_access", id: service.id_service_access },
      metadata: {
        start_date: value.start_date,
        end_date: value.end_date,
        id_aprovacao: service.id_aprovacao || null,
      },
    });
    if (service.id_aprovacao && service.aprovacao_status === "PENDENTE") {
      scheduleApprovalNotify(req, service);
    }
    res.json({ service });
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

exports.patchEnabled = async (req, res, next) => {
  try {
    const { error, value } = serviceAccessEnabledSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const service = await serviceAccessService.toggleServiceAccessEnabled(
      req,
      req.params.id,
      value,
    );
    attachAudit(req, {
      action: "UPDATE",
      module: "patrimonial",
      event: "service_access.enabled",
      resource: { type: "service_access", id: service.id_service_access },
      changes: { status: value.status },
    });
    res.json({ service });
  } catch (err) {
    next(err);
  }
};

exports.addCollaborator = async (req, res, next) => {
  try {
    const { error, value } = serviceAccessCollaboratorSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const service = await serviceAccessService.addCollaborator(req, req.params.id, value);
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "service_access.collaborator.add",
      resource: { type: "service_access", id: service.id_service_access },
    });
    res.status(201).json({ service });
  } catch (err) {
    next(err);
  }
};

exports.removeCollaborator = async (req, res, next) => {
  try {
    const service = await serviceAccessService.removeCollaborator(
      req,
      req.params.id,
      req.params.linkId,
    );
    attachAudit(req, {
      action: "DELETE",
      module: "patrimonial",
      event: "service_access.collaborator.remove",
      resource: { type: "service_access", id: service.id_service_access },
      metadata: {
        nome: service.removido?.nome || null,
        documento: service.removido?.documento || null,
      },
    });
    res.json({ service });
  } catch (err) {
    next(err);
  }
};

exports.bulkCollaborators = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("Arquivo obrigatório.", 400);
    const result = await serviceAccessService.bulkAddCollaborators(req, req.params.id, req.file);
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "service_access.collaborators.bulk",
      resource: { type: "service_access", id: Number(req.params.id) },
      metadata: {
        totalProcessed: result.totalProcessed,
        successCount: result.successCount,
        errorCount: result.errors.length,
      },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.bulkCollaboratorsPreview = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("Arquivo obrigatório.", 400);
    const result = await serviceAccessService.previewBulkServiceCollaborators(
      req,
      req.params.id,
      req.file,
    );
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "service_access.collaborators.bulk_preview",
      resource: { type: "service_access", id: Number(req.params.id) },
      metadata: { previewId: result.previewId, summary: result.summary },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.bulkCollaboratorsCommit = async (req, res, next) => {
  try {
    const { previewId, decisions } = req.body || {};
    if (!previewId) throw new AppError("previewId é obrigatório.", 400);
    const result = await serviceAccessService.commitBulkServiceCollaborators(req, req.params.id, {
      previewId,
      decisions,
    });
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "service_access.collaborators.bulk_commit",
      resource: { type: "service_access", id: Number(req.params.id) },
      metadata: {
        created: result.created,
        updated: result.updated,
        linked: result.linked,
        errorCount: result.errors.length,
      },
    });
    res.json(result);
    if ((result.created || 0) + (result.updated || 0) + (result.linked || 0) > 0) {
      void notifyServiceIfPending(req, req.params.id);
    }
  } catch (err) {
    next(err);
  }
};

exports.addVehicle = async (req, res, next) => {
  try {
    const { error, value } = serviceAccessVehicleSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const service = await serviceAccessService.addVehicle(req, req.params.id, value);
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "service_access.vehicle.add",
      resource: { type: "service_access", id: service.id_service_access },
    });
    res.status(201).json({ service });
  } catch (err) {
    next(err);
  }
};

exports.removeVehicle = async (req, res, next) => {
  try {
    const service = await serviceAccessService.removeVehicle(
      req,
      req.params.id,
      req.params.linkId,
    );
    attachAudit(req, {
      action: "DELETE",
      module: "patrimonial",
      event: "service_access.vehicle.remove",
      resource: { type: "service_access", id: service.id_service_access },
      metadata: {
        placa: service.removido?.placa || null,
        marca: service.removido?.marca || null,
        modelo: service.removido?.modelo || null,
      },
    });
    res.json({ service });
  } catch (err) {
    next(err);
  }
};

exports.downloadCollaboratorsBulkTemplate = async (req, res, next) => {
  try {
    const { sendXlsx } = require("../../utils/bulkTemplateXlsx");
    const file = await serviceAccessService.getCollaboratorsBulkTemplate();
    sendXlsx(res, file);
  } catch (err) {
    next(err);
  }
};

exports.downloadVehiclesBulkTemplate = async (req, res, next) => {
  try {
    const { sendXlsx } = require("../../utils/bulkTemplateXlsx");
    const file = await serviceAccessService.getVehiclesBulkTemplate();
    sendXlsx(res, file);
  } catch (err) {
    next(err);
  }
};

exports.bulkVehicles = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("Arquivo obrigatório.", 400);
    const result = await serviceAccessService.bulkAddVehicles(req, req.params.id, req.file);
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "service_access.vehicles.bulk",
      resource: { type: "service_access", id: Number(req.params.id) },
      metadata: {
        totalProcessed: result.totalProcessed,
        successCount: result.successCount,
        errorCount: result.errors.length,
      },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.bulkVehiclesPreview = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("Arquivo obrigatório.", 400);
    const result = await serviceAccessService.previewBulkServiceVehicles(
      req,
      req.params.id,
      req.file,
    );
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "service_access.vehicles.bulk_preview",
      resource: { type: "service_access", id: Number(req.params.id) },
      metadata: { previewId: result.previewId, summary: result.summary },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.bulkVehiclesCommit = async (req, res, next) => {
  try {
    const { previewId, decisions } = req.body || {};
    if (!previewId) throw new AppError("previewId é obrigatório.", 400);
    const result = await serviceAccessService.commitBulkServiceVehicles(req, req.params.id, {
      previewId,
      decisions,
    });
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "service_access.vehicles.bulk_commit",
      resource: { type: "service_access", id: Number(req.params.id) },
      metadata: {
        created: result.created,
        updated: result.updated,
        linked: result.linked,
        errorCount: result.errors.length,
      },
    });
    res.json(result);
    if ((result.created || 0) + (result.updated || 0) + (result.linked || 0) > 0) {
      void notifyServiceIfPending(req, req.params.id);
    }
  } catch (err) {
    next(err);
  }
};

exports.downloadUnifiedBulkTemplate = async (req, res, next) => {
  try {
    const { sendXlsx } = require("../../utils/bulkTemplateXlsx");
    const file = await serviceAccessService.getUnifiedBulkImportTemplate();
    sendXlsx(res, file);
  } catch (err) {
    next(err);
  }
};

exports.unifiedBulkPreview = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("Arquivo obrigatório.", 400);
    const result = await serviceAccessService.previewUnifiedBulkImport(
      req,
      req.params.id,
      req.file,
    );
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "service_access.bulk_import.preview",
      resource: { type: "service_access", id: Number(req.params.id) },
      metadata: { previewToken: result.previewToken, resumo: result.resumo },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.unifiedBulkConfirm = async (req, res, next) => {
  try {
    const result = await serviceAccessService.confirmUnifiedBulkImport(
      req,
      req.params.id,
      req.body || {},
    );
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "service_access.bulk_import.confirm",
      resource: { type: "service_access", id: Number(req.params.id) },
      metadata: {
        colaboradores: result.colaboradores,
        veiculos: result.veiculos,
        motoristas: result.motoristas,
      },
    });
    res.json(result);
    const changed =
      (result.colaboradores?.created || 0) +
        (result.colaboradores?.updated || 0) +
        (result.colaboradores?.linked || 0) +
        (result.veiculos?.created || 0) +
        (result.veiculos?.updated || 0) +
        (result.veiculos?.linked || 0) +
        (result.motoristas?.linked || 0) >
      0;
    if (changed) {
      void notifyServiceIfPending(req, req.params.id);
    }
  } catch (err) {
    next(err);
  }
};
