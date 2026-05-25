const express = require("express");
const gateController = require("./gate.controller");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();
const gateControl = [authMiddleware, authorizeRoles("ADMIN", "CONTROLADOR")];

router.post("/events/validate", ...gateControl, gateController.validateEvent);
router.post("/events/substitute", ...gateControl, gateController.substituteEvent);
router.post("/services/validate", ...gateControl, gateController.validateService);
router.post("/services/substitute", ...gateControl, gateController.substituteService);

module.exports = router;
