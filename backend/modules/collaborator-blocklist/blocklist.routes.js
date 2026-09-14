const express = require("express");
const blocklistController = require("./blocklist.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("collaborator_blocklist", "view")];
const canCreate = [auth, authorizePermission("collaborator_blocklist", "create")];
const canEdit = [auth, authorizePermission("collaborator_blocklist", "edit")];
const canDelete = [auth, authorizePermission("collaborator_blocklist", "delete")];

router.get("/", ...canView, blocklistController.list);
router.get("/collaborators/search", ...canCreate, blocklistController.searchCollaborators);
router.get("/:id", ...canView, blocklistController.getById);
router.post("/", ...canCreate, blocklistController.create);
router.patch("/:id", ...canEdit, blocklistController.update);
router.delete("/:id", ...canDelete, blocklistController.remove);

module.exports = router;
