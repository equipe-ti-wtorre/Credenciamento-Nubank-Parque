const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const vehicleService = require("./vehicle.service");
const { vehicleCreateSchema, vehicleUpdateSchema, vehicleBlacklistSchema } = require("./vehicle.schema");

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filters = {};
    if (req.query.q || req.query.search) filters.q = req.query.q || req.query.search;
    if (req.query.plate) filters.plate = req.query.plate;
    if (req.query.brand) filters.brand = req.query.brand;
    if (req.query.type) filters.type = req.query.type;
    if (req.query.id_company) {
      const idCompany = parseInt(req.query.id_company, 10);
      if (!Number.isNaN(idCompany)) filters.id_company = idCompany;
    }
    if (req.query.status !== undefined && req.query.status !== "") {
      filters.status = req.query.status === "true" || req.query.status === "1";
    }
    const result = await vehicleService.listVehicles(req, { page, limit, filters });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req, req.params.id);
    res.json({ vehicle });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = vehicleCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const vehicle = await vehicleService.createVehicle(req, value);
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "vehicle.create",
      resource: { type: "vehicle", id: vehicle.id_vehicle, plate: vehicle.plate },
    });
    res.status(201).json({ vehicle });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("Placa já cadastrada para esta empresa.", 409));
    }
    next(err);
  }
};

exports.downloadBulkTemplate = async (req, res, next) => {
  try {
    const { sendXlsx } = require("../../utils/bulkTemplateXlsx");
    const file = await vehicleService.getFleetBulkTemplate(req);
    sendXlsx(res, file);
  } catch (err) {
    next(err);
  }
};

exports.bulkPreview = async (req, res, next) => {
  try {
    const result = await vehicleService.previewBulkVehicles(req, req.file);
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "vehicle.bulk_preview",
      resource: { type: "vehicle_bulk", id: null },
      metadata: { previewToken: result.previewToken, resumo: result.resumo },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.bulkCommit = async (req, res, next) => {
  try {
    const result = await vehicleService.commitBulkVehicles(req, req.body || {});
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "vehicle.bulk_commit",
      resource: { type: "vehicle_bulk", id: null },
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

exports.update = async (req, res, next) => {
  try {
    const { error, value } = vehicleUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const vehicle = await vehicleService.updateVehicle(req, req.params.id, value);
    attachAudit(req, {
      action: "UPDATE",
      module: "patrimonial",
      event: "vehicle.update",
      resource: { type: "vehicle", id: vehicle.id_vehicle },
      changes: value,
    });
    res.json({ vehicle });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("Placa já cadastrada para esta empresa.", 409));
    }
    next(err);
  }
};

exports.addBlacklist = async (req, res, next) => {
  try {
    const { error, value } = vehicleBlacklistSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const vehicle = await vehicleService.addToBlacklist(req, req.params.id, value.reason);
    attachAudit(req, {
      action: "CREATE",
      module: "patrimonial",
      event: "vehicle.blacklist.add",
      resource: { type: "vehicle", id: vehicle.id_vehicle, plate: vehicle.plate },
      changes: { reason: value.reason },
    });
    res.json({ vehicle });
  } catch (err) {
    next(err);
  }
};

exports.removeBlacklist = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.removeFromBlacklist(req, req.params.id);
    attachAudit(req, {
      action: "DEACTIVATE",
      module: "patrimonial",
      event: "vehicle.blacklist.remove",
      resource: { type: "vehicle", id: vehicle.id_vehicle, plate: vehicle.plate },
    });
    res.json({ vehicle });
  } catch (err) {
    next(err);
  }
};

exports.deleteVehicle = async (req, res, next) => {
  try {
    const existing = await vehicleService.findVehicleById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Veículo não encontrado." });
    }

    const result = await vehicleService.deleteVehicle(req, req.params.id);

    attachAudit(req, {
      action: "DELETE",
      module: "patrimonial",
      event: "vehicle.delete",
      resource: {
        type: "vehicle",
        id: Number(req.params.id),
        plate: result.plate,
      },
      metadata: { alertLevel: "critical" },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
