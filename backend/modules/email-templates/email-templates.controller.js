const AppError = require("../../utils/AppError");
const { logAudit } = require("../../utils/auditLogger");
const smtpService = require("../smtp/smtp.service");
const emailTemplatesService = require("./email-templates.service");
const { getCatalogEntry } = require("./email-template.catalog");
const {
  updateTemplateSchema,
  previewSchema,
  testSendSchema,
} = require("./email-templates.schema");

function resolveVars(codigo, overrideVars) {
  const catalog = getCatalogEntry(codigo);
  return {
    ...(catalog?.sampleVars || {}),
    ...(overrideVars || {}),
  };
}

exports.list = async (req, res, next) => {
  try {
    const templates = await emailTemplatesService.list();
    res.json({ templates });
  } catch (err) {
    next(err);
  }
};

exports.getByCodigo = async (req, res, next) => {
  try {
    const template = await emailTemplatesService.getByCodigo(req.params.codigo);
    if (!template) throw new AppError("Template de e-mail não encontrado.", 404);
    res.json({ template });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { error, value } = updateTemplateSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) throw new AppError(error.details[0].message, 400);

    const template = await emailTemplatesService.updateByCodigo(
      req.params.codigo,
      value,
      req.user?.id ?? null,
    );

    await logAudit({
      userId: req.user?.id,
      action: "UPDATE",
      module: "email_templates",
      req,
      metadata: { codigo: template.codigo, ativo: template.ativo },
    });

    res.json({ template });
  } catch (err) {
    next(err);
  }
};

exports.preview = async (req, res, next) => {
  try {
    const { error, value } = previewSchema.validate(req.body || {});
    if (error) throw new AppError(error.details[0].message, 400);

    const codigo = req.params.codigo;
    const stored = await emailTemplatesService.getByCodigo(codigo);
    if (!stored) throw new AppError("Template de e-mail não encontrado.", 404);

    const vars = resolveVars(codigo, value.vars);
    const rendered = emailTemplatesService.renderDraft(
      {
        assunto: value.assunto ?? stored.assunto,
        corpo_html: value.corpo_html ?? stored.corpo_html,
        corpo_texto: value.corpo_texto !== undefined ? value.corpo_texto : stored.corpo_texto,
      },
      vars,
    );

    res.json({ preview: rendered, vars });
  } catch (err) {
    next(err);
  }
};

exports.testSend = async (req, res, next) => {
  try {
    const { error, value } = testSendSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) throw new AppError(error.details[0].message, 400);

    const codigo = req.params.codigo;
    const stored = await emailTemplatesService.getByCodigo(codigo);
    if (!stored) throw new AppError("Template de e-mail não encontrado.", 404);

    const vars = resolveVars(codigo, value.vars);
    const rendered = emailTemplatesService.renderDraft(
      {
        assunto: value.assunto ?? stored.assunto,
        corpo_html: value.corpo_html ?? stored.corpo_html,
        corpo_texto: value.corpo_texto !== undefined ? value.corpo_texto : stored.corpo_texto,
      },
      vars,
    );

    const result = await smtpService.sendMail({
      to: value.destinatario,
      subject: `[Teste] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text || undefined,
      usuarioId: req.user?.id,
      requestId: req.requestId,
    });

    await logAudit({
      userId: req.user?.id,
      action: "TEST",
      module: "email_templates",
      req,
      metadata: {
        codigo,
        destinatario: value.destinatario,
        provider: result?.provider,
        messageId: result?.messageId,
      },
    });

    res.json({
      message: "E-mail de teste enviado com sucesso.",
      provider: result?.provider,
      messageId: result?.messageId || null,
    });
  } catch (err) {
    next(new AppError(err.message || "Falha ao enviar e-mail de teste.", 502));
  }
};
