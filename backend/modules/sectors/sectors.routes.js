const express = require("express");
const sectorsController = require("./sectors.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("sectors", "view")];
const canCreate = [auth, authorizePermission("sectors", "create")];
const canEdit = [auth, authorizePermission("sectors", "edit")];
const canDelete = [auth, authorizePermission("sectors", "delete")];

router.get("/select", auth, sectorsController.listSelect);
router.get("/", ...canView, sectorsController.list);
router.post("/", ...canCreate, sectorsController.create);
router.get("/:id", ...canView, sectorsController.getById);
router.put("/:id", ...canEdit, sectorsController.update);
router.patch("/:id/status", ...canEdit, sectorsController.patchStatus);
router.get("/:id/contacts", ...canView, sectorsController.listContacts);
router.post("/:id/contacts", ...canEdit, sectorsController.addContact);
router.put("/:id/contacts/:contactId", ...canEdit, sectorsController.updateContact);
router.delete("/:id/contacts/:contactId", ...canEdit, sectorsController.removeContact);
router.get("/:id/members", ...canView, sectorsController.listMembers);
router.post("/:id/members", ...canEdit, sectorsController.addMember);
router.patch("/:id/members/:linkId", ...canEdit, sectorsController.updateMember);
router.delete("/:id/members/:linkId", ...canDelete, sectorsController.removeMember);
router.get("/:id/flows", ...canView, sectorsController.getFlows);
router.put("/:id/flows", ...canEdit, sectorsController.updateFlows);

module.exports = router;
