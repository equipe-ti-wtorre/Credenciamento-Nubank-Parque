const AppError = require("../../utils/AppError");
const env = require("../../config/env");
const { logAudit } = require("../../utils/auditLogger");
const { child } = require("../../config/logger");
const smtpService = require("./smtp.service");
const { smtpSettingsSchema, smtpTestSchema } = require("./smtp.schema");

const logger = child({ module: "smtp" });

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await smtpService.getSettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const { error, value } = smtpSettingsSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const settings = await smtpService.upsertSettings(value);

    await logAudit({
      userId: req.user?.id,
      action: "UPDATE",
      module: "smtp",
      req,
      metadata: { settingsId: settings?.id },
    });

    res.json({ settings });
  } catch (err) {
    if (err.message?.includes("obrigatória")) {
      return next(new AppError(err.message, 400));
    }
    logger.error({ err, requestId: req.requestId }, "Falha ao salvar SMTP");
    next(err);
  }
};

exports.testSend = async (req, res, next) => {
  try {
    const { error, value } = smtpTestSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const assunto = value.assunto || `Teste SMTP - ${env.organizationName}`;
    const corpo =
      value.corpo ||
      `Este é um e-mail de teste enviado pelo sistema de credenciamento ${env.organizationName}.`;

    await smtpService.sendMail({
      to: value.destinatario,
      subject: assunto,
      text: corpo,
      usuarioId: req.user?.id,
      requestId: req.requestId,
    });

    await logAudit({
      userId: req.user?.id,
      action: "TEST",
      module: "smtp",
      req,
      metadata: { destinatario: value.destinatario },
    });

    res.json({ message: "E-mail de teste enviado com sucesso." });
  } catch (err) {
    next(new AppError(err.message || "Falha ao enviar e-mail de teste.", 502));
  }
};

exports.listLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = await smtpService.listLogs({ page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
};
