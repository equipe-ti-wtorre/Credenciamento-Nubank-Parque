const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const vehicleService = require("./vehicle.service");
const { vehicleCreateSchema, vehicleUpdateSchema, vehicleBlacklistSchema } = require("./vehicle.schema");

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filters = {};
    if (req.query.plate) filters.plate = req.query.plate;
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
