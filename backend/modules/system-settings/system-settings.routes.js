const express = require("express");
const systemSettingsController = require("./system-settings.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const auth = authMiddleware;
const canViewSession = [auth, authorizePermission("settings_session", "view")];
const canEditSession = [auth, authorizePermission("settings_session", "edit")];
const canEditAppearance = [auth, authorizePermission("settings_appearance", "edit")];

router.get("/session", ...canViewSession, systemSettingsController.getSessionSettings);
router.put("/session", ...canEditSession, systemSettingsController.updateSessionSettings);

// Leitura pública: paleta global necessária na tela de login (outro navegador sem cache)
router.get("/appearance", systemSettingsController.getAppearanceSettings);
router.put(
  "/appearance",
  ...canEditAppearance,
  systemSettingsController.updateAppearanceSettings,
);

module.exports = router;
