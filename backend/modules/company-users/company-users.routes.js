const express = require("express");
const companyUsersController = require("./company-users.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoUsuario } = require("../../middleware/vinculos");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("company_users", "view")];
const canCreate = [authMiddleware, authorizePermission("company_users", "create")];
const canEdit = [authMiddleware, authorizePermission("company_users", "edit")];
const userId = resolverPublicId({ param: "id", table: "usuarios", pk: "id" });

router.get("/", ...canView, companyUsersController.list);
router.get("/:id", authMiddleware, userId, autorizar({ modulo: "company_users", acao: "view", vinculo: vinculoUsuario }), companyUsersController.getById);
router.post("/", ...canCreate, companyUsersController.create);
router.patch("/:id", authMiddleware, userId, autorizar({ modulo: "company_users", acao: "edit", vinculo: vinculoUsuario }), companyUsersController.update);
router.delete("/:id", authMiddleware, userId, autorizar({ modulo: "company_users", acao: "edit", vinculo: vinculoUsuario }), companyUsersController.remove);
router.post("/:id/resend-invite", authMiddleware, userId, autorizar({ modulo: "company_users", acao: "create", vinculo: vinculoUsuario }), companyUsersController.resendInvite);

module.exports = router;
