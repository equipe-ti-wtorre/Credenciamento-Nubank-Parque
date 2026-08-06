const express = require("express");
const emailTemplatesController = require("./email-templates.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("settings_email_templates", "view")];
const canEdit = [auth, authorizePermission("settings_email_templates", "edit")];

router.get("/", ...canView, emailTemplatesController.list);
router.get("/:codigo", ...canView, emailTemplatesController.getByCodigo);
router.put("/:codigo", ...canEdit, emailTemplatesController.update);
router.post("/:codigo/preview", ...canView, emailTemplatesController.preview);
router.post("/:codigo/test", ...canEdit, emailTemplatesController.testSend);

module.exports = router;
