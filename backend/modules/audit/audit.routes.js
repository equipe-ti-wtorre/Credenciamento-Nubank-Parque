const express = require("express");
const auditController = require("./audit.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("audit", "view")];

router.get("/", ...canView, auditController.list);
router.get("/filters", ...canView, auditController.filters);
router.get("/export", ...canView, auditController.exportXlsx);

module.exports = router;
