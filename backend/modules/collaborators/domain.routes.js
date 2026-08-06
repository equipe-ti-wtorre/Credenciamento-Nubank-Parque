const express = require("express");
const collaboratorController = require("./collaborator.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("collaborators", "view")];
const canCreate = [auth, authorizePermission("collaborators", "create")];
const canEdit = [auth, authorizePermission("collaborators", "edit")];
const canDelete = [auth, authorizePermission("collaborators", "delete")];

router.get("/types", auth, collaboratorController.listTypes);
router.get("/roles", ...canView, collaboratorController.listRoles);
router.post("/roles", ...canCreate, collaboratorController.createRole);
router.put("/roles/:id", ...canEdit, collaboratorController.updateRole);
router.delete("/roles/:id", ...canDelete, collaboratorController.deleteRole);

module.exports = router;
