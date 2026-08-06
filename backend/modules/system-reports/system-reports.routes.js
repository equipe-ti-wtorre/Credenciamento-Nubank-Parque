const express = require("express");
const systemReportsController = require("./system-reports.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("settings_system_reports", "view")];

router.get("/audit", ...canView, systemReportsController.listAudit);
router.get("/audit/export", ...canView, systemReportsController.exportAudit);
router.get("/errors", ...canView, systemReportsController.listErrors);
router.get("/errors/export", ...canView, systemReportsController.exportErrors);

module.exports = router;
