const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const materialsService = require("./materials.service");
const {
  locationCreateSchema,
  locationUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
  movementPayloadSchema,
  historyQuerySchema,
  dashboardQuerySchema,
} = require("./materials.schema");

function parseMovementPayload(req) {
  let raw = req.body?.payload;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new AppError("Payload JSON inválido.", 400);
    }
  }
  if (!raw) throw new AppError("Payload da movimentação é obrigatório.", 400);
  const { error, value } = movementPayloadSchema.validate(raw);
  if (error) throw new AppError(error.details[0].message, 400);
  return value;
}

exports.listLocations = async (req, res, next) => {
  try {
    const result = await materialsService.listLocations(req);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.createLocation = async (req, res, next) => {
  try {
    const { error, value } = locationCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const location = await materialsService.createLocation(req, value);
    attachAudit(req, {
      action: "CREATE",
      module: "materials",
      event: "materials.location.create",
      resource: { type: "storage_location", id: location.id_storage_location },
    });
    res.status(201).json({ location });
  } catch (err) {
    next(err);
  }
};

exports.updateLocation = async (req, res, next) => {
  try {
    const { error, value } = locationUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const location = await materialsService.updateLocation(req, req.params.id, value);
    attachAudit(req, {
      action: "UPDATE",
      module: "materials",
      event: "materials.location.update",
      resource: { type: "storage_location", id: location.id_storage_location },
    });
    res.json({ location });
  } catch (err) {
    next(err);
  }
};

exports.listProducts = async (req, res, next) => {
  try {
    const result = await materialsService.listProducts(req);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.createProduct = async (req, res, next) => {
  try {
    const { error, value } = productCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const product = await materialsService.createProduct(req, value);
    attachAudit(req, {
      action: "CREATE",
      module: "materials",
      event: "materials.product.create",
      resource: { type: "product", id: product.id_product },
    });
    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const { error, value } = productUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const product = await materialsService.updateProduct(req, req.params.id, value);
    attachAudit(req, {
      action: "UPDATE",
      module: "materials",
      event: "materials.product.update",
      resource: { type: "product", id: product.id_product },
    });
    res.json({ product });
  } catch (err) {
    next(err);
  }
};

exports.listCompaniesSelect = async (req, res, next) => {
  try {
    res.json(await materialsService.listCompaniesForSelect(req));
  } catch (err) {
    next(err);
  }
};

exports.listVehiclesSelect = async (req, res, next) => {
  try {
    res.json(await materialsService.listVehiclesForSelect(req, Number(req.query.id_company)));
  } catch (err) {
    next(err);
  }
};

exports.listLocationsSelect = async (req, res, next) => {
  try {
    res.json(await materialsService.listLocationsForSelect(req));
  } catch (err) {
    next(err);
  }
};

exports.listProductsSelect = async (req, res, next) => {
  try {
    res.json(await materialsService.listProductsForSelect(req));
  } catch (err) {
    next(err);
  }
};

exports.movementIn = async (req, res, next) => {
  try {
    const payload = parseMovementPayload(req);
    const movement = await materialsService.createMovement(req, "ENTRADA", payload, req.file);
    attachAudit(req, {
      action: "CREATE",
      module: "materials",
      event: "material.movement.in",
      resource: { type: "material_movement", id: movement.id_material_movement },
    });
    res.status(201).json({ movement });
  } catch (err) {
    next(err);
  }
};

exports.movementOut = async (req, res, next) => {
  try {
    const payload = parseMovementPayload(req);
    const movement = await materialsService.createMovement(req, "SAIDA", payload, req.file);
    attachAudit(req, {
      action: "CREATE",
      module: "materials",
      event: "material.movement.out",
      resource: { type: "material_movement", id: movement.id_material_movement },
    });
    res.status(201).json({ movement });
  } catch (err) {
    next(err);
  }
};

exports.getStock = async (req, res, next) => {
  try {
    res.json(await materialsService.getStock(req));
  } catch (err) {
    next(err);
  }
};

exports.getHistory = async (req, res, next) => {
  try {
    const { error, value } = historyQuerySchema.validate(req.query);
    if (error) throw new AppError(error.details[0].message, 400);
    res.json(await materialsService.getHistory(req, value));
  } catch (err) {
    next(err);
  }
};

exports.getDashboard = async (req, res, next) => {
  try {
    const { error, value } = dashboardQuerySchema.validate(req.query);
    if (error) throw new AppError(error.details[0].message, 400);
    res.json(await materialsService.getDashboard(req, value));
  } catch (err) {
    next(err);
  }
};
