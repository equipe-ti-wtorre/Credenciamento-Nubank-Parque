const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const sectorsService = require("./sectors.service");
const {
  sectorCreateSchema,
  sectorUpdateSchema,
  sectorStatusSchema,
  memberCreateSchema,
  memberUpdateSchema,
  flowsUpdateSchema,
} = require("./sectors.schema");

async function assertCanManageSector(req) {
  await sectorsService.assertIsGestor(req.params.id, req.user);
}

exports.listSelect = async (req, res, next) => {
  try {
    const sectors = await sectorsService.listSectorsSelect();
    res.json({ sectors });
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const { page, limit, offset } = sectorsService.parseListQuery(req.query);
    const result = await sectorsService.listSectors({ page, limit, offset, user: req.user });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = sectorCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const sector = await sectorsService.createSector(value, req.user.id);

    attachAudit(req, {
      action: "CREATE",
      module: "sectors",
      event: "sectors.create",
      resource: { type: "sector", id: sector.id, nome: sector.nome },
    });

    res.status(201).json({ sector });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("Já existe um setor com este nome.", 409));
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    await assertCanManageSector(req);
    const { error, value } = sectorUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const sector = await sectorsService.updateSector(req.params.id, value);

    attachAudit(req, {
      action: "UPDATE",
      module: "sectors",
      event: "sectors.update",
      resource: { type: "sector", id: sector.id },
      changes: value,
    });

    res.json({ sector });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("Já existe um setor com este nome.", 409));
    }
    next(err);
  }
};

exports.patchStatus = async (req, res, next) => {
  try {
    await assertCanManageSector(req);
    const { error, value } = sectorStatusSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const sector = await sectorsService.patchSectorStatus(req.params.id, value.ativo);

    attachAudit(req, {
      action: value.ativo ? "ACTIVATE" : "DEACTIVATE",
      module: "sectors",
      event: value.ativo ? "sectors.activate" : "sectors.deactivate",
      resource: { type: "sector", id: sector.id },
    });

    res.json({ sector });
  } catch (err) {
    next(err);
  }
};

exports.listMembers = async (req, res, next) => {
  try {
    await assertCanManageSector(req);
    const members = await sectorsService.listMembers(req.params.id);
    res.json({ members });
  } catch (err) {
    next(err);
  }
};

exports.addMember = async (req, res, next) => {
  try {
    await assertCanManageSector(req);
    const { error, value } = memberCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const members = await sectorsService.addMember(req.params.id, value);

    attachAudit(req, {
      action: "CREATE",
      module: "sectors",
      event: "sectors.members.add",
      resource: { type: "sector", id: Number(req.params.id) },
      changes: value,
    });

    res.status(201).json({ members });
  } catch (err) {
    next(err);
  }
};

exports.updateMember = async (req, res, next) => {
  try {
    await assertCanManageSector(req);
    const { error, value } = memberUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const members = await sectorsService.updateMember(
      req.params.id,
      req.params.linkId,
      value,
    );

    attachAudit(req, {
      action: "UPDATE",
      module: "sectors",
      event: "sectors.members.update",
      resource: { type: "sector", id: Number(req.params.id) },
      metadata: { linkId: Number(req.params.linkId), ...value },
    });

    res.json({ members });
  } catch (err) {
    next(err);
  }
};

exports.removeMember = async (req, res, next) => {
  try {
    await assertCanManageSector(req);
    const members = await sectorsService.removeMember(req.params.id, req.params.linkId);

    attachAudit(req, {
      action: "DEACTIVATE",
      module: "sectors",
      event: "sectors.members.remove",
      resource: { type: "sector", id: Number(req.params.id) },
      metadata: { linkId: Number(req.params.linkId) },
    });

    res.json({ members });
  } catch (err) {
    next(err);
  }
};

exports.getFlows = async (req, res, next) => {
  try {
    await assertCanManageSector(req);
    const flows = await sectorsService.getFlows(req.params.id);
    res.json({ flows });
  } catch (err) {
    next(err);
  }
};

exports.updateFlows = async (req, res, next) => {
  try {
    await assertCanManageSector(req);
    const { error, value } = flowsUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const flows = await sectorsService.upsertFlows(req.params.id, value.flows);

    attachAudit(req, {
      action: "UPDATE",
      module: "sectors",
      event: "sectors.flows.update",
      resource: { type: "sector", id: Number(req.params.id) },
      changes: { flows: value.flows },
    });

    res.json({ flows });
  } catch (err) {
    next(err);
  }
};
