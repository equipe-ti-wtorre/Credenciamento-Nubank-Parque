const express = require("express");
const teamsController = require("./teams.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("settings_teams", "view")];
const canCreate = [auth, authorizePermission("settings_teams", "create")];
const canEdit = [auth, authorizePermission("settings_teams", "edit")];
const canDelete = [auth, authorizePermission("settings_teams", "delete")];
const teamId = resolverPublicId({ param: "id", table: "teams_integrations", pk: "id" });

router.get("/", ...canView, teamsController.list);
router.get("/config", ...canView, teamsController.config);
router.get("/:id", auth, teamId, autorizar({ modulo: "settings_teams", acao: "view" }), teamsController.getById);
router.post("/", ...canCreate, teamsController.create);
router.put("/:id", auth, teamId, autorizar({ modulo: "settings_teams", acao: "edit" }), teamsController.update);
router.delete("/:id", auth, teamId, autorizar({ modulo: "settings_teams", acao: "delete" }), teamsController.remove);
router.post("/:id/test", auth, teamId, autorizar({ modulo: "settings_teams", acao: "edit" }), teamsController.test);
router.post("/:id/send", auth, teamId, autorizar({ modulo: "settings_teams", acao: "edit" }), teamsController.send);

module.exports = router;
