const express = require("express");
const systemSettingsController = require("./system-settings.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("settings_session", "view")];
const canEdit = [auth, authorizePermission("settings_session", "edit")];

router.get("/session", ...canView, systemSettingsController.getSessionSettings);
router.put("/session", ...canEdit, systemSettingsController.updateSessionSettings);

module.exports = router;
