const express = require("express");
const { eventGridWebhookMiddleware } = require("../../middleware/event-grid-webhook.middleware");
const acsWebhookController = require("./acs-email-webhook.controller");

const router = express.Router();

/** Event Grid → ACS email delivery reports (no JWT; signature validated in middleware). */
router.post(
  "/acs-email",
  eventGridWebhookMiddleware,
  acsWebhookController.handleAcsEmailWebhook,
);

module.exports = router;
