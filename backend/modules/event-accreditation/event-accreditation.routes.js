const express = require("express");
const controller = require("./event-accreditation.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const {
  authorizePermission,
  authorizeAnyPermission,
  authorizeAccreditationAccess,
} = require("../../middleware/permissionMiddleware");
const {
  coverUploadMiddleware,
  inviteFileUploadMiddleware,
} = require("../../middleware/upload.middleware");

const router = express.Router();
const auth = authMiddleware;
const canAccess = [auth, authorizeAccreditationAccess()];
const canView = [
  auth,
  authorizeAnyPermission([
    { modulo: "event_accreditation", acao: "view" },
    { modulo: "approvals", acao: "view" },
  ]),
];
const canCreate = [auth, authorizePermission("event_accreditation", "create")];
const canEdit = [auth, authorizePermission("event_accreditation", "edit")];
const canManageInvite = [
  auth,
  authorizeAnyPermission([
    { modulo: "event_accreditation", acao: "edit" },
    { modulo: "event_accreditation", acao: "create" },
  ]),
];

router.get("/bracelet-types", ...canAccess, controller.listBraceletTypes);
router.post(
  "/bracelet-types",
  auth,
  authorizeAnyPermission([
    { modulo: "event_accreditation", acao: "edit" },
    { modulo: "event_accreditation", acao: "create" },
  ]),
  controller.createBraceletType,
);
router.patch("/bracelet-types/:id", ...canEdit, controller.updateBraceletType);

router.get("/companies", ...canCreate, controller.listCompanies);

router.get("/", ...canAccess, controller.list);
router.post("/", ...canCreate, controller.create);
router.get("/:id/export", ...canView, controller.exportXlsx);
router.post("/:id/collaborators/decide", ...canView, controller.decideCollaborators);
router.patch("/:id/collaborators/bracelet", ...canView, controller.changeBracelet);
router.post("/:id/notify-companies", ...canEdit, controller.notifyCompanies);
router.post("/:id/cover", ...canManageInvite, coverUploadMiddleware, controller.uploadCover);
router.get("/:id/invite", ...canManageInvite, controller.getInvite);
router.put("/:id/invite", ...canManageInvite, controller.saveInvite);
router.post(
  "/:id/invite/files",
  ...canManageInvite,
  inviteFileUploadMiddleware,
  controller.uploadInviteFile,
);
router.delete("/:id/invite/files/:fileId", ...canManageInvite, controller.deleteInviteFile);
router.post("/:id/invite/send", ...canManageInvite, controller.sendInvite);
router.post("/:id/internal/register", ...canAccess, controller.registerInternal);
router.delete("/:id/internal/register", ...canAccess, controller.unregisterInternal);
router.get("/:id", ...canAccess, controller.getById);
router.patch("/:id", ...canEdit, controller.update);
router.patch("/:id/status", ...canEdit, controller.patchStatus);
router.post(
  "/:id/companies/:idCompany/collaborators",
  ...canEdit,
  controller.addCollaborator,
);
router.delete(
  "/:id/companies/:idCompany/collaborators/:linkId",
  ...canEdit,
  controller.removeCollaborator,
);
router.post(
  "/:id/companies/:idCompany/complete",
  ...canEdit,
  controller.completeCompany,
);

module.exports = router;
