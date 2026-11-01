const express = require("express");
const collaboratorController = require("./collaborator.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("collaborators", "view")];
const canCreate = [auth, authorizePermission("collaborators", "create")];
const canEdit = [auth, authorizePermission("collaborators", "edit")];
const canDelete = [auth, authorizePermission("collaborators", "delete")];
const roleId = resolverPublicId({ param: "id", table: "collaborator_role", pk: "id_collaborator_role" });

router.get("/types", auth, collaboratorController.listTypes);
router.get("/roles", ...canView, collaboratorController.listRoles);
router.post("/roles", ...canCreate, collaboratorController.createRole);
router.put("/roles/:id", auth, roleId, autorizar({ modulo: "collaborators", acao: "edit" }), collaboratorController.updateRole);
router.delete("/roles/:id", auth, roleId, autorizar({ modulo: "collaborators", acao: "delete" }), collaboratorController.deleteRole);

module.exports = router;
