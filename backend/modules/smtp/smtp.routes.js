const express = require("express");
const smtpController = require("./smtp.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("settings_smtp", "view")];
const canEdit = [auth, authorizePermission("settings_smtp", "edit")];

router.get("/settings", ...canView, smtpController.getSettings);
router.put("/settings", ...canEdit, smtpController.updateSettings);
router.post("/test", ...canEdit, smtpController.testSend);
router.get("/logs", ...canView, smtpController.listLogs);

module.exports = router;
