const AppError = require("../../utils/AppError");
const { logAudit } = require("../../utils/auditLogger");
const { child } = require("../../config/logger");
const tenantService = require("./tenant.service");
const { tenantBodySchema, tenantUpdateSchema } = require("./tenant.schema");

const logger = child({ module: "tenants" });

exports.getMsalConfig = async (req, res, next) => {
  try {
    const config = await tenantService.getMsalConfig(req.clientType);
    if (!config) {
      throw new AppError(
        "Nenhum tenant Azure ativo cadastrado. Faça login como admin e configure em Administração > Tenants Azure.",
        404,
      );
    }
    res.json(config);
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const tenants = await tenantService.listTenants();
    res.json({ tenants });
  } catch (err) {
    logger.error({ err, requestId: req.requestId }, "Falha ao listar tenants");
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const row = await tenantService.findTenantById(req.params.id);
    if (!row) throw new AppError("Tenant não encontrado.", 404);
    res.json({ tenant: tenantService.mapTenantRow(row) });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = tenantBodySchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    if (!value.client_secret) {
      throw new AppError("client_secret é obrigatório ao criar tenant.", 400);
    }

    const row = await tenantService.createTenant({
      ...value,
      ativo: value.ativo !== false,
      eh_principal: !!value.eh_principal,
    });

    await logAudit({
      userId: req.user?.id,
      action: "CREATE",
      module: "tenants",
      req,
      metadata: { tenantId: row.id, nome: row.nome },
    });

    res.status(201).json({ tenant: tenantService.mapTenantRow(row) });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("azure_tenant_id já cadastrado.", 409));
    }
    logger.error({ err, requestId: req.requestId }, "Falha ao criar tenant");
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { error, value } = tenantUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const row = await tenantService.updateTenant(req.params.id, value);
    if (!row) throw new AppError("Tenant não encontrado.", 404);

    await logAudit({
      userId: req.user?.id,
      action: "UPDATE",
      module: "tenants",
      req,
      metadata: { tenantId: row.id },
    });

    res.json({ tenant: tenantService.mapTenantRow(row) });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("azure_tenant_id já cadastrado.", 409));
    }
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const row = await tenantService.findTenantById(req.params.id);
    if (!row) throw new AppError("Tenant não encontrado.", 404);
    await tenantService.deactivateTenant(req.params.id);

    await logAudit({
      userId: req.user?.id,
      action: "DELETE",
      module: "tenants",
      req,
      metadata: { tenantId: row.id },
    });

    res.json({ message: "Tenant desativado." });
  } catch (err) {
    next(err);
  }
};

exports.status = async (req, res, next) => {
  try {
    const tenants = await tenantService.getTenantsStatus();
    res.json({ tenants });
  } catch (err) {
    next(err);
  }
};
