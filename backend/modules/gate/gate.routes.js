const express = require("express");
const gateController = require("./gate.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("gate", "view")];
const canCreate = [authMiddleware, authorizePermission("gate", "create")];
const canEdit = [authMiddleware, authorizePermission("gate", "edit")];

router.get("/events/today", ...canView, gateController.listTodayEvents);
router.post("/events/validate", ...canCreate, gateController.validateEvent);
router.post("/events/substitute", ...canEdit, gateController.substituteEvent);
router.get("/services/today", ...canView, gateController.listTodayServices);
router.post("/services/validate", ...canCreate, gateController.validateService);
router.post("/services/substitute", ...canEdit, gateController.substituteService);

module.exports = router;
