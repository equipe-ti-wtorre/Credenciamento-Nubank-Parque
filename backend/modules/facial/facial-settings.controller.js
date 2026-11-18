"use strict";

const AppError = require("../../utils/AppError");
const { logAudit } = require("../../utils/auditLogger");
const { facialGatewaySettingsSchema, enrollmentStatusSchema, facialDeviceSchema } = require("./facial.schema");
const facialGatewayConfig = require("./facial-gateway-config.service");
const facialStatusService = require("./facial-status.service");
const facialSyncService = require("./facial.sync.service");
const enrollmentService = require("./facial.enrollment.service");
const devicesService = require("./facial.devices.service");
const dahuaClient = require("./dahua.client");
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

function normalizeDeviceHost(host) {
  let value = String(host || "").trim().replace(/^https?:\/\//i, "");
  const slash = value.indexOf("/");
  if (slash >= 0) value = value.slice(0, slash);
  return value;
}

function parseDeviceBody(body, { requirePassword }) {
  const { error, value } = facialDeviceSchema.validate(body || {}, { abortEarly: false });
  if (error) {
    throw new AppError(error.details.map((d) => d.message).join("; "), 400);
  }
  value.host = normalizeDeviceHost(value.host);
  if (!value.host || /[\s/]/.test(value.host)) {
    throw new AppError("Host do terminal inválido. Use o IP alcançável pela VPN.", 400);
  }
  const password = String(value.password || "").trim();
  if (requirePassword && !password) {
    throw new AppError("Senha do terminal é obrigatória.", 400);
  }
  value.password = password || null;
  return value;
}

exports.listDevices = async (req, res, next) => {
  try {
    const devices = await devicesService.listPublic();
    res.json({ devices });
  } catch (err) {
    next(err);
  }
};

exports.createDevice = async (req, res, next) => {
  try {
    const value = parseDeviceBody(req.body, { requirePassword: true });
    const device = await devicesService.createDevice(value);
    await logAudit({
      userId: req.user?.id,
      action: "CREATE",
      module: "facial_settings",
      req,
      metadata: { event: "facial.device.create", device_key: device.device_key, host: device.host },
    });
    res.status(201).json({ device });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("Já existe um aparelho com esse identificador.", 409));
    }
    next(err);
  }
};

exports.updateDevice = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) throw new AppError("Aparelho inválido.", 400);
    const value = parseDeviceBody(req.body, { requirePassword: false });
    const device = await devicesService.updateDevice(id, value);
    if (!device) throw new AppError("Aparelho não encontrado.", 404);
    await logAudit({
      userId: req.user?.id,
      action: "UPDATE",
      module: "facial_settings",
      req,
      metadata: { event: "facial.device.update", id, device_key: device.device_key, host: device.host },
    });
    res.json({ device });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("Já existe um aparelho com esse identificador.", 409));
    }
    next(err);
  }
};

exports.deleteDevice = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) throw new AppError("Aparelho inválido.", 400);
    const removed = await devicesService.deleteDevice(id);
    if (!removed) throw new AppError("Aparelho não encontrado.", 404);
    await logAudit({
      userId: req.user?.id,
      action: "DELETE",
      module: "facial_settings",
      req,
      metadata: { event: "facial.device.delete", id },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.testDevice = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) throw new AppError("Aparelho inválido.", 400);
    const row = await devicesService.getById(id);
    if (!row) throw new AppError("Aparelho não encontrado.", 404);
    const device = devicesService.mapRuntime(row);
    if (!device.password) {
      throw new AppError("Senha do terminal indisponível.", 400);
    }
    const result = await dahuaClient.testConnection(device);
    res.json(result);
  } catch (err) {
    if (err.statusCode) return next(err);
    res.json({ ok: false, error: err.message || "Falha ao testar o terminal" });
  }
};
