const express = require("express");
const blocklistController = require("./blocklist.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("collaborator_blocklist", "view")];
const canCreate = [auth, authorizePermission("collaborator_blocklist", "create")];
const canEdit = [auth, authorizePermission("collaborator_blocklist", "edit")];
const canDelete = [auth, authorizePermission("collaborator_blocklist", "delete")];
const blockId = resolverPublicId({
  param: "id",
  table: "collaborator_block_list",
  pk: "id_collaborator",
});

router.get("/", ...canView, blocklistController.list);
router.get("/collaborators/search", ...canCreate, blocklistController.searchCollaborators);
router.get("/:id", auth, blockId, autorizar({ modulo: "collaborator_blocklist", acao: "view" }), blocklistController.getById);
router.post("/", ...canCreate, blocklistController.create);
router.patch("/:id", auth, blockId, autorizar({ modulo: "collaborator_blocklist", acao: "edit" }), blocklistController.update);
router.delete("/:id", auth, blockId, autorizar({ modulo: "collaborator_blocklist", acao: "delete" }), blocklistController.remove);

module.exports = router;
