const AppError = require("../../utils/AppError");
const env = require("../../config/env");
const { logAudit } = require("../../utils/auditLogger");
const { child } = require("../../config/logger");
const whatsappService = require("./whatsapp.service");
const limitsService = require("./openwa-limits.service");
const {
  whatsappSettingsSchema,
  whatsappTestSchema,
  whatsappLimitsSchema,
} = require("./whatsapp.schema");

const logger = child({ module: "whatsapp" });

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await whatsappService.getSettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const { error, value } = whatsappSettingsSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) throw new AppError(error.details[0].message, 400);

    const settings = await whatsappService.updateSettings(value);

    await logAudit({
      userId: req.user?.id,
      action: "UPDATE",
      module: "whatsapp",
      req,
      metadata: {
        provider: settings?.provider,
        base_url: settings?.base_url,
        session_id: settings?.session_id,
        ativo: settings?.ativo,
        api_key_changed: !!value.api_key,
      },
    });

    res.json({ settings });
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error({ err, requestId: req.requestId }, "Falha ao salvar configuração de WhatsApp");
    }
    next(err);
  }
};

exports.getStatus = async (req, res, next) => {
  try {
    const status = await whatsappService.getStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
};

exports.startSession = async (req, res, next) => {
  try {
    const session = await whatsappService.startSession();
    await logAudit({
      userId: req.user?.id,
      action: "SESSION_START",
      module: "whatsapp",
      req,
      metadata: { session: session?.name, status: session?.status },
    });
    res.json({ message: "Sessão iniciada.", session });
  } catch (err) {
    next(err);
  }
};

exports.stopSession = async (req, res, next) => {
  try {
    const session = await whatsappService.stopSession();
    await logAudit({
      userId: req.user?.id,
      action: "SESSION_STOP",
      module: "whatsapp",
      req,
      metadata: { session: session?.name, status: session?.status },
    });
    res.json({ message: "Sessão parada.", session });
  } catch (err) {
    next(err);
  }
};

exports.getQr = async (req, res, next) => {
  try {
    const qr = await whatsappService.getQr();
    res.json(qr);
  } catch (err) {
    next(err);
  }
};

exports.testSend = async (req, res, next) => {
  try {
    const { error, value } = whatsappTestSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const mensagem =
      value.mensagem ||
      `Mensagem de teste do sistema de credenciamento ${env.organizationName}.`;

    const result = await whatsappService.sendTest({
      destinatario: value.destinatario,
      mensagem,
      usuarioId: req.user?.id,
      requestId: req.requestId,
    });

    await logAudit({
      userId: req.user?.id,
      action: "TEST",
      module: "whatsapp",
      req,
      metadata: {
        destinatario: value.destinatario,
        chatId: result?.chatId,
        messageId: result?.messageId,
      },
    });

    res.json({
      message: "Mensagem de teste enviada.",
      provider: result?.provider,
      chatId: result?.chatId,
      messageId: result?.messageId || null,
    });
  } catch (err) {
    next(err);
  }
};

exports.getLimits = async (req, res, next) => {
  try {
    const limits = await limitsService.getLimits();
    res.json({ limits });
  } catch (err) {
    next(err);
  }
};

exports.updateLimits = async (req, res, next) => {
  try {
    const { error, value } = whatsappLimitsSchema.validate(req.body, { abortEarly: true });
    if (error) throw new AppError(error.details[0].message, 400);

    const { restart = true, ...data } = value;
    const result = await limitsService.saveLimits(data, { restart });

    await logAudit({
      userId: req.user?.id,
      action: "UPDATE_LIMITS",
      module: "whatsapp",
      req,
      metadata: { updates: result.updates, restart: result.restart },
    });

    res.json({
      limits: result.limits,
      restart: result.restart,
      message: result.restart.ok
        ? "Limites salvos e OpenWA reiniciado."
        : result.restart.requested
          ? `Limites salvos, mas o reinício falhou: ${result.restart.message}. Rode "pm2 restart openwa".`
          : "Limites salvos. Reinicie o OpenWA para aplicar.",
    });
  } catch (err) {
    next(err);
  }
};

exports.listLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const result = await whatsappService.listLogs({ page, limit, q, status });
    res.json(result);
  } catch (err) {
    next(err);
  }
};
