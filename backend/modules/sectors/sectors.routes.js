const express = require("express");
const sectorsController = require("./sectors.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("sectors", "view")];
const canCreate = [auth, authorizePermission("sectors", "create")];
const canEdit = [auth, authorizePermission("sectors", "edit")];
const canDelete = [auth, authorizePermission("sectors", "delete")];
const sectorId = resolverPublicId({ param: "id", table: "setores", pk: "id" });
const contactId = resolverPublicId({ param: "contactId", table: "setor_contatos", pk: "id" });
const memberId = resolverPublicId({ param: "linkId", table: "setor_usuarios", pk: "id" });
const viewSector = autorizar({ modulo: "sectors", acao: "view" });
const editSector = autorizar({ modulo: "sectors", acao: "edit" });
const deleteSector = autorizar({ modulo: "sectors", acao: "delete" });

router.get("/select", auth, sectorsController.listSelect);
router.get("/", ...canView, sectorsController.list);
router.post("/", ...canCreate, sectorsController.create);
router.get("/:id", auth, sectorId, viewSector, sectorsController.getById);
router.put("/:id", auth, sectorId, editSector, sectorsController.update);
router.patch("/:id/status", auth, sectorId, editSector, sectorsController.patchStatus);
router.get("/:id/contacts", auth, sectorId, viewSector, sectorsController.listContacts);
router.post("/:id/contacts", auth, sectorId, editSector, sectorsController.addContact);
router.put("/:id/contacts/:contactId", auth, sectorId, contactId, editSector, sectorsController.updateContact);
router.delete("/:id/contacts/:contactId", auth, sectorId, contactId, editSector, sectorsController.removeContact);
router.get("/:id/members", auth, sectorId, viewSector, sectorsController.listMembers);
router.post("/:id/members", auth, sectorId, editSector, sectorsController.addMember);
router.patch("/:id/members/:linkId/flows", auth, sectorId, memberId, editSector, sectorsController.patchMemberFlow);
router.patch("/:id/members/:linkId", auth, sectorId, memberId, editSector, sectorsController.updateMember);
router.delete("/:id/members/:linkId", auth, sectorId, memberId, deleteSector, sectorsController.removeMember);
router.get("/:id/flows", auth, sectorId, viewSector, sectorsController.getFlows);
router.put("/:id/flows", auth, sectorId, editSector, sectorsController.updateFlows);

module.exports = router;
