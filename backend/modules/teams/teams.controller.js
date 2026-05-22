const AppError = require("../../utils/AppError");
const { logAudit } = require("../../utils/auditLogger");
const { child } = require("../../config/logger");
const env = require("../../config/env");
const teamsService = require("./teams.service");
const {
  teamsBodySchema,
  teamsUpdateSchema,
  teamsTestSchema,
  teamsSendSchema,
} = require("./teams.schema");

const logger = child({ module: "teams" });

exports.config = async (req, res, next) => {
  try {
    res.json({
      defaultTeamsAppId: env.teamsAppId || null,
      manifestExternalId: env.teamsAppExternalId || null,
    });
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const integrations = await teamsService.listIntegrations();
    res.json({ integrations });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const row = await teamsService.findById(req.params.id);
    if (!row) throw new AppError("Integração não encontrada.", 404);
    res.json({ integration: teamsService.mapIntegrationRow(row) });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = teamsBodySchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const row = await teamsService.createIntegration(value);

    await logAudit({
      userId: req.user?.id,
      action: "CREATE",
      module: "teams",
      req,
      metadata: { integrationId: row.id, nome: row.nome },
    });

    res.status(201).json({ integration: teamsService.mapIntegrationRow(row) });
  } catch (err) {
    if (err.message?.includes("Tenant Azure")) {
      return next(new AppError(err.message, 400));
    }
    logger.error({ err, requestId: req.requestId }, "Falha ao criar integração Teams");
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { error, value } = teamsUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const row = await teamsService.updateIntegration(req.params.id, value);
    if (!row) throw new AppError("Integração não encontrada.", 404);

    await logAudit({
      userId: req.user?.id,
      action: "UPDATE",
      module: "teams",
      req,
      metadata: { integrationId: row.id },
    });

    res.json({ integration: teamsService.mapIntegrationRow(row) });
  } catch (err) {
    if (err.message?.includes("Tenant Azure")) {
      return next(new AppError(err.message, 400));
    }
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const row = await teamsService.findById(req.params.id);
    if (!row) throw new AppError("Integração não encontrada.", 404);
    await teamsService.deactivateIntegration(req.params.id);

    await logAudit({
      userId: req.user?.id,
      action: "DELETE",
      module: "teams",
      req,
      metadata: { integrationId: row.id },
    });

    res.json({ message: "Integração desativada." });
  } catch (err) {
    next(err);
  }
};

exports.test = async (req, res, next) => {
  try {
    const { error, value } = teamsTestSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await teamsService.testIntegration(req.params.id, value);
    if (!result.ok) {
      throw new AppError(result.message, 502);
    }

    await logAudit({
      userId: req.user?.id,
      action: "TEST",
      module: "teams",
      req,
      metadata: {
        integrationId: parseInt(req.params.id, 10),
        email: value.email || null,
      },
    });

    res.json({ message: result.message });
  } catch (err) {
    next(err);
  }
};

exports.send = async (req, res, next) => {
  try {
    const { error, value } = teamsSendSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await teamsService.sendNotification(req.params.id, value);
    if (!result.ok) {
      throw new AppError(result.message, 502);
    }

    await logAudit({
      userId: req.user?.id,
      action: "SEND",
      module: "teams",
      req,
      metadata: { integrationId: parseInt(req.params.id, 10), email: value.email },
    });

    res.json({ message: result.message });
  } catch (err) {
    next(err);
  }
};
