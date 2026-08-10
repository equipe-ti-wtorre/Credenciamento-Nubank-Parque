const { EventWebhook } = require("@sendgrid/eventwebhook");
const AppError = require("../utils/AppError");
const { child } = require("../config/logger");
const emailConfigService = require("../modules/smtp/email-config.service");

const logger = child({ module: "sendgrid-webhook" });

/**
 * SendGrid Signed Event Webhook auth (Twilio headers).
 * Loads Verification Key from email_provider_config (encrypted in DB).
 */
async function sendgridWebhookMiddleware(req, res, next) {
  try {
    const publicKey = await emailConfigService.getSendgridWebhookVerificationKey();
    if (!publicKey) {
      logger.warn("SendGrid webhook verification key não configurada");
      return next(new AppError("Webhook SendGrid não configurado.", 503));
    }

    const signature =
      req.headers["x-twilio-email-event-webhook-signature"] ||
      req.headers["X-Twilio-Email-Event-Webhook-Signature"] ||
      "";
    const timestamp =
      req.headers["x-twilio-email-event-webhook-timestamp"] ||
      req.headers["X-Twilio-Email-Event-Webhook-Timestamp"] ||
      "";

    if (!signature || !timestamp) {
      return next(new AppError("Assinatura SendGrid ausente.", 401));
    }

    // Assinatura exige o body bruto; re-serializar req.body invalida a verificação.
    if (!Buffer.isBuffer(req.rawBody)) {
      logger.warn({ requestId: req.requestId }, "rawBody ausente para webhook SendGrid");
      return next(new AppError("Corpo bruto do webhook indisponível para verificação.", 500));
    }
    const rawBody = req.rawBody.toString("utf8");

    const ew = new EventWebhook();
    let ok = false;
    try {
      const ecPublicKey = ew.convertPublicKeyToECDSA(publicKey);
      ok = ew.verifySignature(ecPublicKey, rawBody, signature, timestamp);
    } catch (err) {
      logger.warn(
        { err: err?.message, requestId: req.requestId },
        "Falha ao verificar assinatura SendGrid",
      );
      ok = false;
    }

    if (!ok) {
      logger.warn({ requestId: req.requestId }, "Assinatura SendGrid inválida");
      return next(new AppError("Assinatura SendGrid inválida.", 401));
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  sendgridWebhookMiddleware,
};
