const express = require("express");
const tenantController = require("./tenant.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("settings_tenants", "view")];
const canCreate = [auth, authorizePermission("settings_tenants", "create")];
const canEdit = [auth, authorizePermission("settings_tenants", "edit")];
const canDelete = [auth, authorizePermission("settings_tenants", "delete")];
const tenantId = resolverPublicId({ param: "id", table: "azure_tenants", pk: "id" });

router.get("/msal-config", tenantController.getMsalConfig);
router.get("/status", ...canView, tenantController.status);
router.get("/", ...canView, tenantController.list);
router.get("/:id", auth, tenantId, autorizar({ modulo: "settings_tenants", acao: "view" }), tenantController.getById);
router.post("/", ...canCreate, tenantController.create);
router.put("/:id", auth, tenantId, autorizar({ modulo: "settings_tenants", acao: "edit" }), tenantController.update);
router.delete("/:id", auth, tenantId, autorizar({ modulo: "settings_tenants", acao: "delete" }), tenantController.remove);

module.exports = router;
