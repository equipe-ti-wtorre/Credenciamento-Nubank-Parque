"use strict";

const AppError = require("../../utils/AppError");
const { logAudit } = require("../../utils/auditLogger");
const { facialGatewaySettingsSchema, enrollmentStatusSchema } = require("./facial.schema");
const facialGatewayConfig = require("./facial-gateway-config.service");
const facialStatusService = require("./facial-status.service");
const facialSyncService = require("./facial.sync.service");
const enrollmentService = require("./facial.enrollment.service");
const { parseEnrollmentStatus } = require("./facial.contract");

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await facialGatewayConfig.getPublicConfig();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const { error, value } = facialGatewaySettingsSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      throw new AppError(error.details.map((d) => d.message).join("; "), 400);
    }

    const settings = await facialGatewayConfig.updateConfig(value);

    await logAudit({
      userId: req.user?.id,
      action: "UPDATE",
      module: "facial_settings",
      req,
      metadata: {
        enabled: settings.enabled,
        commands_queue: settings.commands_queue,
        status_queue: settings.status_queue,
      },
    });

    res.json({ settings });
  } catch (err) {
    if (err.message?.includes("obrigat") || err.message?.includes("IP inválido")) {
      return next(new AppError(err.message, 400));
    }
    next(err);
  }
};

exports.getStatus = async (req, res, next) => {
  try {
    const status = await facialStatusService.getStatusSummary();
    res.json({ status });
  } catch (err) {
    next(err);
  }
};

exports.listLogs = async (req, res, next) => {
  try {
    const type = typeof req.query.type === "string" ? req.query.type : "enrollment";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const result = await facialStatusService.listLogs({ type, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.ingestStatus = async (req, res, next) => {
  try {
    const { error, value } = enrollmentStatusSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: false,
    });
    if (error) {
      throw new AppError(error.details.map((d) => d.message).join("; "), 400);
    }
    const parsed = parseEnrollmentStatus(value);
    if (!parsed.ok) {
      throw new AppError(parsed.error || "Payload enrollment-status inválido", 400);
    }
    const result = await enrollmentService.applyEnrollmentStatus(parsed);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.testSync = async (req, res, next) => {
  try {
    const result = await facialSyncService.testSync();
    await logAudit({
      userId: req.user?.id,
      action: "SYNC",
      module: "facial_settings",
      req,
      metadata: {
        event: "facial.sync.test",
        ok: result.ok,
        transport: result.transport,
        eligibleCount: result.eligibleCount,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
      },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.forceSync = async (req, res, next) => {
  try {
    const result = await facialSyncService.forceSync();
    if (result.alreadyRunning) {
      return res.status(409).json(result);
    }
    await logAudit({
      userId: req.user?.id,
      action: "SYNC",
      module: "facial_settings",
      req,
      metadata: {
        event: "facial.sync.force",
        ok: result.ok,
        eligible: result.eligible,
        queued: result.queued,
        sent: result.sent,
        skipped: result.skipped,
        failed: result.failed,
      },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};
