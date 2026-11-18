const express = require("express");
const controller = require("./whatsapp.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("settings_whatsapp", "view")];
const canEdit = [auth, authorizePermission("settings_whatsapp", "edit")];

router.get("/settings", ...canView, controller.getSettings);
router.put("/settings", ...canEdit, controller.updateSettings);
router.get("/status", ...canView, controller.getStatus);
router.get("/qr", ...canView, controller.getQr);
router.post("/session/start", ...canEdit, controller.startSession);
router.post("/session/stop", ...canEdit, controller.stopSession);
router.post("/test", ...canEdit, controller.testSend);
router.get("/logs", ...canView, controller.listLogs);
router.get("/limits", ...canView, controller.getLimits);
router.put("/limits", ...canEdit, controller.updateLimits);

module.exports = router;
