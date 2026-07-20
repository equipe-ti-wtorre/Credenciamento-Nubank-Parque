const { child } = require("../../config/logger");
const emailSender = require("./emailSender");

const logger = child({ module: "acs-email-webhook" });

/**
 * Map ACS delivery status to internal smtp_send_logs status.
 * @param {string} status
 * @returns {'entregue'|'bounce'|null}
 */
function mapAcsDeliveryStatus(status) {
  if (!status) return null;
  const normalized = String(status).trim().toLowerCase();
  if (normalized === "delivered") return "entregue";
  // Bounced, Suppressed, Quarantined, FilteredSpam, Failed, etc.
  return "bounce";
}

function extractDeliveryReports(events) {
  const reports = [];
  for (const evt of events) {
    const type = evt?.eventType || evt?.type || "";
    if (
      type !== "Microsoft.Communication.EmailDeliveryReportReceived" &&
      !String(type).includes("EmailDeliveryReportReceived")
    ) {
      continue;
    }
    const data = evt.data || evt;
    const messageId =
      data.messageId || data.MessageId || data.internetMessageId || null;
    const status =
      data.status ||
      data.deliveryStatus ||
      data.Status ||
      (data.deliveryStatusDetails && data.deliveryStatusDetails.status) ||
      null;
    if (messageId && status) {
      reports.push({
        messageId: String(messageId),
        status: String(status),
        raw: data,
      });
    }
  }
  return reports;
}

async function handleAcsEmailWebhook(req, res, next) {
  try {
    const eg = req.eventGrid || {};

    if (eg.isValidation) {
      const code = eg.validationCode;
      if (!code) {
        return res.status(400).json({ error: "validationCode ausente." });
      }
      return res.status(200).json({ validationResponse: code });
    }

    const events = eg.events || [];
    const reports = extractDeliveryReports(events);
    let updated = 0;

    for (const report of reports) {
      const internal = mapAcsDeliveryStatus(report.status);
      if (!internal) continue;
      const n = await emailSender.updateDeliveryStatus(report.messageId, internal);
      updated += n;
      if (n === 0) {
        logger.info(
          { messageId: report.messageId, status: report.status },
          "Delivery report sem log correspondente",
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
  handleAcsEmailWebhook,
  mapAcsDeliveryStatus,
  extractDeliveryReports,
};
