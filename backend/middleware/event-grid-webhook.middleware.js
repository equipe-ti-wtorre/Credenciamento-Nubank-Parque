const crypto = require("crypto");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const { child } = require("../config/logger");

const logger = child({ module: "event-grid-webhook" });

function isSubscriptionValidation(body) {
  if (!Array.isArray(body) || body.length === 0) return false;
  return body.some(
    (evt) =>
      evt?.eventType === "Microsoft.EventGrid.SubscriptionValidationEvent" ||
      evt?.eventType === "Microsoft.EventGrid.SubscriptionValidationEvent".toLowerCase(),
  );
}

function getValidationCode(body) {
  const evt = body.find(
    (e) => e?.eventType === "Microsoft.EventGrid.SubscriptionValidationEvent",
  );
  return evt?.data?.validationCode || null;
}

/**
 * Event Grid webhook auth:
 * - Subscription validation handshake: no signature required (returns validationResponse).
 * - Delivery events: require aeg-signature matching EVENT_GRID_WEBHOOK_SECRET (HMAC-SHA256 of body).
 *
 * Attaches `req.eventGrid = { isValidation, validationCode, events }`.
 */
function eventGridWebhookMiddleware(req, res, next) {
  const body = req.body;
  const events = Array.isArray(body) ? body : body ? [body] : [];

  if (isSubscriptionValidation(events)) {
    req.eventGrid = {
      isValidation: true,
      validationCode: getValidationCode(events),
      events,
    };
    return next();
  }

  const secret = env.eventGridWebhookSecret;
  if (!secret) {
    logger.warn("EVENT_GRID_WEBHOOK_SECRET não configurado");
    return next(new AppError("Webhook Event Grid não configurado.", 503));
  }

  const signatureHeader =
    req.headers["aeg-signature"] ||
    req.headers["Aeg-Signature"] ||
    req.headers["aeg-signature-url"] ||
    "";

  if (!signatureHeader) {
    return next(new AppError("Assinatura Event Grid ausente.", 401));
  }

  // Azure Event Grid webhook signature: Base64-encoded HMAC-SHA256 of the request body
  const rawBody =
    Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : typeof req.body === "string"
        ? Buffer.from(req.body, "utf8")
        : Buffer.from(JSON.stringify(req.body), "utf8");

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

  const provided = String(signatureHeader).trim();

  let ok = false;
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    ok = false;
  }

  // Fallback: shared key sent as aeg-signature (portal "Webhook" key auth)
  if (!ok && provided === secret) {
    ok = true;
  }

  if (!ok) {
    logger.warn({ requestId: req.requestId }, "Assinatura Event Grid inválida");
    return next(new AppError("Assinatura Event Grid inválida.", 401));
  }

  req.eventGrid = {
    isValidation: false,
    validationCode: null,
    events,
  };
  return next();
}

module.exports = {
  eventGridWebhookMiddleware,
  isSubscriptionValidation,
  getValidationCode,
};
