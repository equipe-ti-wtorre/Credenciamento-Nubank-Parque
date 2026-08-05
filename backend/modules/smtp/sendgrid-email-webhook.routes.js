const express = require("express");
const { sendgridWebhookMiddleware } = require("../../middleware/sendgrid-webhook.middleware");
const sendgridWebhookController = require("./sendgrid-email-webhook.controller");

const router = express.Router();

/** SendGrid Event Webhook → delivery status (no JWT; signature validated in middleware). */
router.post(
  "/sendgrid-email",
  sendgridWebhookMiddleware,
  sendgridWebhookController.handleSendgridEmailWebhook,
);

module.exports = router;
