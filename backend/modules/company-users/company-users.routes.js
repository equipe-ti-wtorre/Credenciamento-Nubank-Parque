const express = require("express");
const companyUsersController = require("./company-users.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("company_users", "view")];
const canCreate = [authMiddleware, authorizePermission("company_users", "create")];
const canEdit = [authMiddleware, authorizePermission("company_users", "edit")];

router.get("/", ...canView, companyUsersController.list);
router.get("/:id", ...canView, companyUsersController.getById);
router.post("/", ...canCreate, companyUsersController.create);
router.patch("/:id", ...canEdit, companyUsersController.update);
router.post("/:id/resend-invite", ...canCreate, companyUsersController.resendInvite);

module.exports = router;
