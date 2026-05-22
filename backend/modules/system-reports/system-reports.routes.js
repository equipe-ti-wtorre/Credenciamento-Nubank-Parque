const express = require("express");
const systemReportsController = require("./system-reports.controller");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();
const adminOnly = [authMiddleware, authorizeRoles("ADMIN")];

router.get("/audit", ...adminOnly, systemReportsController.listAudit);
router.get("/audit/export", ...adminOnly, systemReportsController.exportAudit);
router.get("/errors", ...adminOnly, systemReportsController.listErrors);
router.get("/errors/export", ...adminOnly, systemReportsController.exportErrors);

module.exports = router;
