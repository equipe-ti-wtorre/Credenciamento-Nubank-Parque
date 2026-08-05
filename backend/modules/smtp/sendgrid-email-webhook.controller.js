const { child } = require("../../config/logger");
const emailSender = require("./emailSender");

const logger = child({ module: "sendgrid-email-webhook" });

/**
 * Map SendGrid event to internal smtp_send_logs status.
 * @param {string} event
 * @returns {'entregue'|'bounce'|null}
 */
function mapSendgridEvent(event) {
  if (!event) return null;
  const normalized = String(event).trim().toLowerCase();
  if (normalized === "delivered") return "entregue";
  if (normalized === "bounce" || normalized === "dropped") return "bounce";
  return null;
}

/**
 * Extract delivery reports from SendGrid Event Webhook payload.
 * @param {unknown} body
 * @returns {{ messageId: string, event: string, status: 'entregue'|'bounce' }[]}
 */
function extractDeliveryReports(body) {
  const events = Array.isArray(body) ? body : body ? [body] : [];
  const reports = [];
  const seen = new Set();

  for (const evt of events) {
    const eventName = evt?.event || evt?.event_type || "";
    const status = mapSendgridEvent(eventName);
    if (!status) continue;

    const rawId = evt?.sg_message_id || evt?.sg_messageId || null;
    if (!rawId) continue;

    const messageId = String(rawId);
    const key = `${messageId}:${status}`;
    if (seen.has(key)) continue;
    seen.add(key);

    reports.push({
      messageId,
      event: String(eventName),
      status,
    });
  }

  return reports;
}

async function handleSendgridEmailWebhook(req, res, next) {
  try {
    const events = Array.isArray(req.body) ? req.body : req.body ? [req.body] : [];
    const reports = extractDeliveryReports(req.body);
    let updated = 0;

    for (const report of reports) {
      const n = await emailSender.updateDeliveryStatus(
        report.messageId,
        report.status,
      );
      updated += n;
      if (n === 0) {
        logger.info(
          { messageId: report.messageId, event: report.event },
          "Evento SendGrid sem log correspondente",
        );
      }
    }

    res.status(200).json({
      received: events.length,
      reports: reports.length,
      updated,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleSendgridEmailWebhook,
  mapSendgridEvent,
  extractDeliveryReports,
};
