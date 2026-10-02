const express = require("express");
const controller = require("./error-logs.controller");
const { clientErrorLimiter } = require("../../middleware/rateLimiter");

const router = express.Router();

router.post("/client", clientErrorLimiter, controller.reportClient);

module.exports = router;
