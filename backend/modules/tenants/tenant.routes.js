const express = require("express");
const tenantController = require("./tenant.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("settings_tenants", "view")];
const canCreate = [auth, authorizePermission("settings_tenants", "create")];
const canEdit = [auth, authorizePermission("settings_tenants", "edit")];
const canDelete = [auth, authorizePermission("settings_tenants", "delete")];

router.get("/msal-config", tenantController.getMsalConfig);
router.get("/status", ...canView, tenantController.status);
router.get("/", ...canView, tenantController.list);
router.get("/:id", ...canView, tenantController.getById);
router.post("/", ...canCreate, tenantController.create);
router.put("/:id", ...canEdit, tenantController.update);
router.delete("/:id", ...canDelete, tenantController.remove);

module.exports = router;
