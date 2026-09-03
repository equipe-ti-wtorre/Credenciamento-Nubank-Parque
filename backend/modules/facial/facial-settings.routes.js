"use strict";

const express = require("express");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const facialSettingsController = require("./facial-settings.controller");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("settings_facial", "view")];
const canEdit = [authMiddleware, authorizePermission("settings_facial", "edit")];

router.get("/settings", ...canView, facialSettingsController.getSettings);
router.put("/settings", ...canEdit, facialSettingsController.updateSettings);
router.get("/status", ...canView, facialSettingsController.getStatus);
router.get("/logs", ...canView, facialSettingsController.listLogs);
router.post("/status/ingest", ...canEdit, facialSettingsController.ingestStatus);
router.post("/sync/test", ...canEdit, facialSettingsController.testSync);
router.post("/sync/force", ...canEdit, facialSettingsController.forceSync);

module.exports = router;
