const express = require("express");
const systemSettingsController = require("./system-settings.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const auth = authMiddleware;
const canViewSession = [auth, authorizePermission("settings_session", "view")];
const canEditSession = [auth, authorizePermission("settings_session", "edit")];
const canEditAppearance = [auth, authorizePermission("settings_appearance", "edit")];
const canViewEaNotify = [auth, authorizePermission("settings_event_accreditation", "view")];
const canEditEaNotify = [auth, authorizePermission("settings_event_accreditation", "edit")];
const canEditAccessSchedule = [auth, authorizePermission("settings_access_schedule", "edit")];

router.get("/session", ...canViewSession, systemSettingsController.getSessionSettings);
router.put("/session", ...canEditSession, systemSettingsController.updateSessionSettings);

// Leitura pública: paleta global necessária na tela de login (outro navegador sem cache)
router.get("/appearance", systemSettingsController.getAppearanceSettings);
router.put(
  "/appearance",
  ...canEditAppearance,
  systemSettingsController.updateAppearanceSettings,
);

router.get(
  "/event-accreditation-notify",
  ...canViewEaNotify,
  systemSettingsController.getEventAccreditationNotifySettings,
);
router.put(
  "/event-accreditation-notify",
  ...canEditEaNotify,
  systemSettingsController.updateEventAccreditationNotifySettings,
);
router.get(
  "/event-accreditation-notify/users",
  ...canViewEaNotify,
  systemSettingsController.listAdInternalUsers,
);

router.get("/access-schedule", auth, systemSettingsController.getAccessScheduleSettings);
router.put(
  "/access-schedule",
  ...canEditAccessSchedule,
  systemSettingsController.updateAccessScheduleSettings,
);

module.exports = router;
