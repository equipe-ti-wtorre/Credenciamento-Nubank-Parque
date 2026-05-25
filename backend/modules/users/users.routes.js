const express = require("express");
const usersController = require("./users.controller");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();
const adminOnly = [authMiddleware, authorizeRoles("ADMIN")];

router.get("/", ...adminOnly, usersController.list);
router.post("/sync-departments", ...adminOnly, usersController.syncDepartments);
router.post("/sync-ad-users", ...adminOnly, usersController.syncAdUsers);
router.get("/:id", ...adminOnly, usersController.getById);
router.patch("/:id", ...adminOnly, usersController.update);
router.post("/:id/sync-ad", ...adminOnly, usersController.syncUserDepartment);

module.exports = router;
