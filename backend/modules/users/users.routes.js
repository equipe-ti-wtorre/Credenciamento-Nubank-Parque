const express = require("express");
const usersController = require("./users.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("users", "view")];
const canEdit = [authMiddleware, authorizePermission("users", "edit")];

router.get("/", ...canView, usersController.list);
router.post("/sync-departments", ...canEdit, usersController.syncDepartments);
router.post("/sync-ad-users", ...canEdit, usersController.syncAdUsers);
router.get("/:id", ...canView, usersController.getById);
router.patch("/:id", ...canEdit, usersController.update);
router.post("/:id/sync-ad", ...canEdit, usersController.syncUserDepartment);

module.exports = router;
