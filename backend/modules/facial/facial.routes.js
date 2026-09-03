"use strict";

const express = require("express");
const { facialGatewayEventsMiddleware } = require("../../middleware/facial-gateway-events.middleware");
const facialEventsController = require("./facial.events.controller");
const facialGatewayController = require("./facial.gateway.controller");

const router = express.Router();

router.get("/health", facialGatewayController.health);

router.post(
  "/jobs/claim",
  facialGatewayEventsMiddleware,
  facialGatewayController.claimJobs,
);

router.get(
  "/jobs/queued",
  facialGatewayEventsMiddleware,
  facialGatewayController.listQueuedJobs,
);

router.post(
  "/jobs/queued",
  facialGatewayEventsMiddleware,
  facialGatewayController.listQueuedJobs,
);

router.post(
  "/status",
  facialGatewayEventsMiddleware,
  facialGatewayController.handleEnrollmentStatus,
);

router.post(
  "/events",
  facialGatewayEventsMiddleware,
  facialEventsController.handleFacialEvent,
);

module.exports = router;
