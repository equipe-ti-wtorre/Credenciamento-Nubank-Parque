const express = require("express");
const teamsController = require("./teams.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("settings_teams", "view")];
const canCreate = [auth, authorizePermission("settings_teams", "create")];
const canEdit = [auth, authorizePermission("settings_teams", "edit")];
const canDelete = [auth, authorizePermission("settings_teams", "delete")];

router.get("/", ...canView, teamsController.list);
router.get("/config", ...canView, teamsController.config);
router.get("/:id", ...canView, teamsController.getById);
router.post("/", ...canCreate, teamsController.create);
router.put("/:id", ...canEdit, teamsController.update);
router.delete("/:id", ...canDelete, teamsController.remove);
router.post("/:id/test", ...canEdit, teamsController.test);
router.post("/:id/send", ...canEdit, teamsController.send);

module.exports = router;
