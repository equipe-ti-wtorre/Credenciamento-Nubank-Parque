const express = require("express");
const usersController = require("./users.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoUsuario } = require("../../middleware/vinculos");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("users", "view")];
const canEdit = [authMiddleware, authorizePermission("users", "edit")];
const userId = resolverPublicId({ param: "id", table: "usuarios", pk: "id" });

router.get("/", ...canView, usersController.list);
router.post("/sync-departments", ...canEdit, usersController.syncDepartments);
router.get("/sync-ad-status", ...canView, usersController.getAdSyncStatus);
router.post("/sync-ad-users", ...canEdit, usersController.syncAdUsers);
router.get("/:id", authMiddleware, userId, autorizar({ modulo: "users", acao: "view", vinculo: vinculoUsuario }), usersController.getById);
router.patch("/:id", authMiddleware, userId, autorizar({ modulo: "users", acao: "edit", vinculo: vinculoUsuario }), usersController.update);
router.post("/:id/sync-ad", authMiddleware, userId, autorizar({ modulo: "users", acao: "edit", vinculo: vinculoUsuario }), usersController.syncUserDepartment);

module.exports = router;
