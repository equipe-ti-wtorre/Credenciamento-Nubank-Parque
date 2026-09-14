const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const service = require("./event-accreditation.service");
const {
  createSchema,
  updateSchema,
  statusSchema,
  collaboratorSchema,
  braceletCreateSchema,
  braceletUpdateSchema,
  decideSchema,
  changeBraceletSchema,
  notifyCompaniesSchema,
  sectorCompaniesSchema,
  internalRegisterSchema,
  inviteSchema,
  inviteSendSchema,
  bulkConfirmSchema,
} = require("./event-accreditation.schema");
const { notifyApprovalCreated } = require("../approvals/approvals.notifications");
const notifications = require("./event-accreditation.notifications");

exports.list = async (req, res, next) => {
  try {
    const { page, limit } = service.parseListQuery(req.query);
    const filters = service.parseListFilters(req.query);
    const result = await service.listItems(req, { page, limit, filters });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const item = await service.getById(req, req.params.id);
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const item = await service.createItem(req, value);
    attachAudit(req, {
      action: "CREATE",
      module: "event_accreditation",
      event: "event_accreditation.create",
      resource: {
        type: "event_accreditation",
        id: item.id_event_accreditation,
        name: item.name,
      },
    });
    if (item.internalEnabled) {
      notifications.notifyInternalUsersInvited({
        item,
        usuarioId: req.user?.id,
        requestId: req.requestId,
      });
    }
    const { invitedCompanyIds, invitedSectorIds, internalEnabled, ...payload } = item;
    if ((payload.setores || []).length) {
      notifications.notifySectorsToInviteCompanies({
        item: payload,
        setores: payload.setores,
        usuarioId: req.user?.id,
      });
    }
    res.status(201).json({ item: payload });
  } catch (err) {
    next(err);
  }
};

exports.duplicate = async (req, res, next) => {
  try {
    const item = await service.duplicateItem(req, req.params.id);
    attachAudit(req, {
      action: "CREATE",
      module: "event_accreditation",
      event: "event_accreditation.duplicate",
      resource: {
        type: "event_accreditation",
        id: item.id_event_accreditation,
        name: item.name,
      },
      metadata: {
        source_id: Number(req.params.id),
      },
    });
    if (item.internalEnabled) {
      notifications.notifyInternalUsersInvited({
        item,
        usuarioId: req.user?.id,
        requestId: req.requestId,
      });
    }
    const { invitedCompanyIds, invitedSectorIds, internalEnabled, ...payload } = item;
    if ((payload.setores || []).length) {
      notifications.notifySectorsToInviteCompanies({
        item: payload,
        setores: payload.setores,
        usuarioId: req.user?.id,
      });
    }
    res.status(201).json({ item: payload });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { error, value } = updateSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const item = await service.updateItem(req, req.params.id, value);
    attachAudit(req, {
      action: "UPDATE",
      module: "event_accreditation",
      event: "event_accreditation.update",
      resource: {
        type: "event_accreditation",
        id: item.id_event_accreditation,
        name: item.name,
      },
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.patchStatus = async (req, res, next) => {
  try {
    const { error, value } = statusSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const { item, changes } = await service.patchStatus(req, req.params.id, value.ativo);
    attachAudit(req, {
      action: changes.wasDeactivated ? "DEACTIVATE" : "ACTIVATE",
      module: "event_accreditation",
      event: "event_accreditation.status",
      resource: {
        type: "event_accreditation",
        id: item.id_event_accreditation,
        name: item.name,
      },
      changes: { ativo: item.ativo },
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const removed = await service.deleteItem(req, req.params.id);
    attachAudit(req, {
      action: "DELETE",
      module: "event_accreditation",
      event: "event_accreditation.delete",
      resource: {
        type: "event_accreditation",
        id: removed.id_event_accreditation,
        name: removed.name,
      },
    });
    res.json({ removed });
  } catch (err) {
    next(err);
  }
};

exports.addCollaborator = async (req, res, next) => {
  try {
    const { error, value } = collaboratorSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const item = await service.addCollaborator(
      req,
      req.params.id,
      req.params.idCompany,
      value,
    );
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.removeCollaborator = async (req, res, next) => {
  try {
    const item = await service.removeCollaborator(
      req,
      req.params.id,
      req.params.idCompany,
      req.params.linkId,
    );
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.completeCompany = async (req, res, next) => {
  try {
    const item = await service.completeCompany(req, req.params.id, req.params.idCompany);
    const { approvalCreated, ...payload } = item;
    if (approvalCreated?.id) {
      const company = (payload.companies || []).find(
        (c) => Number(c.id_company) === Number(req.params.idCompany),
      );
      notifyApprovalCreated({
        idAprovacao: approvalCreated.id,
        idSetor: company?.id_setor || payload.id_setor,
        idSolicitante: payload.id_solicitante,
      }).catch(() => {});
    }
    res.json({ item: payload, approvalCreated: approvalCreated || null });
  } catch (err) {
    next(err);
  }
};

exports.registerInternal = async (req, res, next) => {
  try {
    const { error, value } = internalRegisterSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const item = await service.registerInternal(req, req.params.id, value);
    const { approvalCreated, ...payload } = item;
    if (approvalCreated?.id) {
      notifyApprovalCreated({
        idAprovacao: approvalCreated.id,
        idSetor: payload.id_setor,
        idSolicitante: payload.id_solicitante,
      }).catch(() => {});
    }
    attachAudit(req, {
      action: "CREATE",
      module: "event_accreditation",
      event: "event_accreditation.internal.register",
      resource: {
        type: "event_accreditation",
        id: payload.id_event_accreditation,
        name: payload.name,
      },
    });
    res.status(201).json({ item: payload, approvalCreated: approvalCreated || null });
  } catch (err) {
    next(err);
  }
};

exports.unregisterInternal = async (req, res, next) => {
  try {
    const item = await service.unregisterInternal(req, req.params.id);
    attachAudit(req, {
      action: "DELETE",
      module: "event_accreditation",
      event: "event_accreditation.internal.unregister",
      resource: {
        type: "event_accreditation",
        id: item.id_event_accreditation,
        name: item.name,
      },
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.changeBracelet = async (req, res, next) => {
  try {
    const { error, value } = changeBraceletSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const item = await service.changeBracelet(req, req.params.id, value);
    attachAudit(req, {
      action: "UPDATE",
      module: "event_accreditation",
      event: "event_accreditation.bracelet.change",
      resource: {
        type: "event_accreditation",
        id: item.id_event_accreditation,
        name: item.name,
      },
      changes: {
        target: value.target,
        ids: value.ids,
        id_bracelet_type: value.id_bracelet_type,
      },
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.decideCollaborators = async (req, res, next) => {
  try {
    const { error, value } = decideSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const item = await service.decideCollaborators(req, req.params.id, value);
    attachAudit(req, {
      action: "UPDATE",
      module: "event_accreditation",
      event: `event_accreditation.decide.${value.action}`,
      resource: {
        type: "event_accreditation",
        id: item.id_event_accreditation,
        name: item.name,
      },
      changes: { action: value.action, ids: value.ids },
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.notifyCompanies = async (req, res, next) => {
  try {
    const { error, value } = notifyCompaniesSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const result = await service.notifyCompanies(req, req.params.id, value);
    attachAudit(req, {
      action: "UPDATE",
      module: "event_accreditation",
      event: "event_accreditation.notify_companies",
      resource: {
        type: "event_accreditation",
        id: result.item.id_event_accreditation,
        name: result.item.name,
      },
      changes: { id_company: value.id_company || null, sent: result.sent },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.exportXlsx = async (req, res, next) => {
  try {
    const { buffer, filename } = await service.exportXlsx(req, req.params.id);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

exports.uploadCover = async (req, res, next) => {
  try {
    const item = await service.uploadCover(req, req.params.id);
    attachAudit(req, {
      action: "UPDATE",
      module: "event_accreditation",
      event: "event_accreditation.cover.upload",
      resource: {
        type: "event_accreditation",
        id: item.id_event_accreditation,
        name: item.name,
      },
      changes: { cover: item.cover },
    });
    res.json({ item, cover: item.cover });
  } catch (err) {
    next(err);
  }
};

exports.getInvite = async (req, res, next) => {
  try {
    const result = await service.getInvite(req, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.saveInvite = async (req, res, next) => {
  try {
    const { error, value } = inviteSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const result = await service.saveInvite(req, req.params.id, value);
    attachAudit(req, {
      action: "UPDATE",
      module: "event_accreditation",
      event: "event_accreditation.invite.save",
      resource: { type: "event_accreditation", id: Number(req.params.id) },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.uploadInviteFile = async (req, res, next) => {
  try {
    const result = await service.addInviteFile(req, req.params.id);
    attachAudit(req, {
      action: "UPDATE",
      module: "event_accreditation",
      event: "event_accreditation.invite.file.upload",
      resource: { type: "event_accreditation", id: Number(req.params.id) },
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

exports.deleteInviteFile = async (req, res, next) => {
  try {
    const result = await service.deleteInviteFile(req, req.params.id, req.params.fileId);
    attachAudit(req, {
      action: "DELETE",
      module: "event_accreditation",
      event: "event_accreditation.invite.file.delete",
      resource: { type: "event_accreditation", id: Number(req.params.id) },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.sendInvite = async (req, res, next) => {
  try {
    const { error, value } = inviteSendSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const result = await service.sendInvite(req, req.params.id, value);
    attachAudit(req, {
      action: "UPDATE",
      module: "event_accreditation",
      event: `event_accreditation.invite.${value.mode}`,
      resource: {
        type: "event_accreditation",
        id: result.item?.id_event_accreditation || Number(req.params.id),
        name: result.item?.name,
      },
      changes: { mode: value.mode, sent: result.sent, status: result.invite?.status },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.listSectors = async (req, res, next) => {
  try {
    const sectors = await service.listCreateSectors(req);
    res.json({ sectors });
  } catch (err) {
    next(err);
  }
};

exports.addSectorCompanies = async (req, res, next) => {
  try {
    const { error, value } = sectorCompaniesSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const result = await service.addSectorCompanies(
      req,
      req.params.id,
      req.params.idSetor,
      value,
    );
    attachAudit(req, {
      action: "UPDATE",
      module: "event_accreditation",
      event: "event_accreditation.sector_companies.add",
      resource: {
        type: "event_accreditation",
        id: result.item.id_event_accreditation,
        name: result.item.name,
      },
      changes: { id_setor: Number(req.params.idSetor), added: result.added },
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

exports.removeSectorCompany = async (req, res, next) => {
  try {
    const item = await service.removeSectorCompany(
      req,
      req.params.id,
      req.params.idSetor,
      req.params.idCompany,
    );
    attachAudit(req, {
      action: "DELETE",
      module: "event_accreditation",
      event: "event_accreditation.sector_companies.remove",
      resource: {
        type: "event_accreditation",
        id: item.id_event_accreditation,
        name: item.name,
      },
      changes: {
        id_setor: Number(req.params.idSetor),
        id_company: Number(req.params.idCompany),
      },
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.notifySectorCompanies = async (req, res, next) => {
  try {
    const { error, value } = notifyCompaniesSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const result = await service.notifySectorCompanies(
      req,
      req.params.id,
      req.params.idSetor,
      value,
    );
    attachAudit(req, {
      action: "UPDATE",
      module: "event_accreditation",
      event: "event_accreditation.sector_companies.notify",
      resource: {
        type: "event_accreditation",
        id: result.item.id_event_accreditation,
        name: result.item.name,
      },
      changes: { id_setor: Number(req.params.idSetor), sent: result.sent },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.notifySectorIndication = async (req, res, next) => {
  try {
    const item = await service.notifySectorIndication(req, req.params.id, req.params.idCompany);
    attachAudit(req, {
      action: "UPDATE",
      module: "event_accreditation",
      event: "event_accreditation.notify_sector",
      resource: {
        type: "event_accreditation",
        id: item.id_event_accreditation,
        name: item.name,
      },
      changes: { id_company: Number(req.params.idCompany) },
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.notifyOwnerValidated = async (req, res, next) => {
  try {
    const item = await service.notifyOwnerValidated(req, req.params.id, req.params.idCompany);
    attachAudit(req, {
      action: "UPDATE",
      module: "event_accreditation",
      event: "event_accreditation.notify_owner",
      resource: {
        type: "event_accreditation",
        id: item.id_event_accreditation,
        name: item.name,
      },
      changes: { id_company: Number(req.params.idCompany) },
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.listCompanies = async (req, res, next) => {
  try {
    const companies = await service.listLinkableCompanies(req);
    res.json({ companies });
  } catch (err) {
    next(err);
  }
};

exports.listBraceletTypes = async (req, res, next) => {
  try {
    const includeInactive = String(req.query.includeInactive || "") === "1";
    const types = await service.listBraceletTypes({
      event_kind: req.query.event_kind,
      includeInactive,
    });
    res.json({ types });
  } catch (err) {
    next(err);
  }
};

exports.createBraceletType = async (req, res, next) => {
  try {
    const { error, value } = braceletCreateSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const type = await service.createBraceletType(value);
    res.status(201).json({ type: service.mapBraceletRow(type) });
  } catch (err) {
    next(err);
  }
};

exports.updateBraceletType = async (req, res, next) => {
  try {
    const { error, value } = braceletUpdateSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const type = await service.updateBraceletType(req.params.id, value);
    res.json({ type: service.mapBraceletRow(type) });
  } catch (err) {
    next(err);
  }
};

exports.downloadCompanyBulkTemplate = async (req, res, next) => {
  try {
    const { sendXlsx } = require("../../utils/bulkTemplateXlsx");
    const file = await service.getCompanyBulkImportTemplate(
      req,
      req.params.id,
      req.params.idCompany,
    );
    sendXlsx(res, file);
  } catch (err) {
    next(err);
  }
};

exports.previewCompanyBulkImport = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("Arquivo obrigatório.", 400);
    const result = await service.previewCompanyBulkImport(
      req,
      req.params.id,
      req.params.idCompany,
      req.file,
    );
    attachAudit(req, {
      action: "CREATE",
      module: "event_accreditation",
      event: "event_accreditation.bulk_preview",
      resource: {
        type: "event_accreditation_company_bulk",
        id: result.previewToken,
      },
      metadata: {
        id_event_accreditation: Number(req.params.id),
        id_company: Number(req.params.idCompany),
        resumo: result.resumo,
      },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.confirmCompanyBulkImport = async (req, res, next) => {
  try {
    const { error, value } = bulkConfirmSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);
    const result = await service.confirmCompanyBulkImport(
      req,
      req.params.id,
      req.params.idCompany,
      value,
    );
    attachAudit(req, {
      action: "CREATE",
      module: "event_accreditation",
      event: "event_accreditation.bulk_confirm",
      resource: {
        type: "event_accreditation_company_bulk",
        id: value.previewToken,
      },
      metadata: {
        id_event_accreditation: Number(req.params.id),
        id_company: Number(req.params.idCompany),
        colaboradores: result.colaboradores,
      },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};
