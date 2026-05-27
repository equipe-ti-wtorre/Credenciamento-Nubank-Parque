const express = require("express");
const systemSettingsController = require("./system-settings.controller");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();

router.get("/session", authMiddleware, systemSettingsController.getSessionSettings);
router.put(
  "/session",
  authMiddleware,
  authorizeRoles("ADMIN"),
  systemSettingsController.updateSessionSettings,
);

module.exports = router;
