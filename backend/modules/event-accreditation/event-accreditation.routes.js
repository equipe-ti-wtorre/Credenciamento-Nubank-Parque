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
  bulkUploadMiddleware,
} = require("../../middleware/upload.middleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoCredenciamento } = require("../../middleware/vinculos");

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
const canDelete = [
  auth,
  authorizeAnyPermission([
    { modulo: "event_accreditation", acao: "delete" },
    { modulo: "event_accreditation", acao: "edit" },
  ]),
];
const canManageInvite = [
  auth,
  authorizeAnyPermission([
    { modulo: "event_accreditation", acao: "edit" },
    { modulo: "event_accreditation", acao: "create" },
  ]),
];

const itemId = resolverPublicId({
  param: "id",
  table: "event_accreditation",
  pk: "id_event_accreditation",
});
const braceletId = resolverPublicId({
  param: "id",
  table: "bracelet_type",
  pk: "id_bracelet_type",
  attach: "bracelet",
});
const companyId = resolverPublicId({ param: "idCompany", table: "company", pk: "id_company" });
const setorId = resolverPublicId({ param: "idSetor", table: "setores", pk: "id" });
const linkId = resolverPublicId({
  param: "linkId",
  table: "event_accreditation_collaborator",
  pk: "id_event_accreditation_collaborator",
});
const fileId = resolverPublicId({
  param: "fileId",
  table: "event_accreditation_invite_file",
  pk: "id_event_accreditation_invite_file",
});
const readItem = [authorizeAccreditationAccess(), autorizar({ vinculo: vinculoCredenciamento })];
const editItem = autorizar({
  modulo: "event_accreditation",
  acao: "edit",
  vinculo: vinculoCredenciamento,
});
const viewItem = autorizar({
  any: [
    { modulo: "event_accreditation", acao: "view" },
    { modulo: "approvals", acao: "view" },
  ],
  vinculo: vinculoCredenciamento,
});
const deleteItem = autorizar({
  any: [
    { modulo: "event_accreditation", acao: "delete" },
    { modulo: "event_accreditation", acao: "edit" },
  ],
  vinculo: vinculoCredenciamento,
});
const inviteItem = autorizar({
  any: [
    { modulo: "event_accreditation", acao: "edit" },
    { modulo: "event_accreditation", acao: "create" },
  ],
  vinculo: vinculoCredenciamento,
});
const createOnItem = autorizar({
  modulo: "event_accreditation",
  acao: "create",
  vinculo: vinculoCredenciamento,
});

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
router.patch(
  "/bracelet-types/:id",
  auth,
  braceletId,
  autorizar({ modulo: "event_accreditation", acao: "edit" }),
  controller.updateBraceletType,
);

router.get("/companies", ...canAccess, controller.listCompanies);
router.get("/sectors", ...canCreate, controller.listSectors);

router.get("/", ...canAccess, controller.list);
router.post("/", ...canCreate, controller.create);
router.post("/:id/duplicate", auth, itemId, createOnItem, controller.duplicate);
router.get("/:id/export", auth, itemId, viewItem, controller.exportXlsx);
router.post("/:id/collaborators/decide", auth, itemId, viewItem, controller.decideCollaborators);
router.patch("/:id/collaborators/bracelet", auth, itemId, viewItem, controller.changeBracelet);
router.post("/:id/notify-companies", auth, itemId, editItem, controller.notifyCompanies);
router.post("/:id/cover", auth, itemId, inviteItem, coverUploadMiddleware, controller.uploadCover);
router.get("/:id/invite", auth, itemId, inviteItem, controller.getInvite);
router.put("/:id/invite", auth, itemId, inviteItem, controller.saveInvite);
router.post(
  "/:id/invite/files",
  auth,
  itemId,
  inviteItem,
  inviteFileUploadMiddleware,
  controller.uploadInviteFile,
);
router.delete(
  "/:id/invite/files/:fileId",
  auth,
  itemId,
  fileId,
  inviteItem,
  controller.deleteInviteFile,
);
router.post("/:id/invite/send", auth, itemId, inviteItem, controller.sendInvite);
router.post("/:id/internal/register", auth, itemId, ...readItem, controller.registerInternal);
router.delete("/:id/internal/register", auth, itemId, ...readItem, controller.unregisterInternal);
router.get("/:id", auth, itemId, ...readItem, controller.getById);
router.patch("/:id", auth, itemId, editItem, controller.update);
router.patch("/:id/status", auth, itemId, editItem, controller.patchStatus);
router.delete("/:id", auth, itemId, deleteItem, controller.remove);
router.get(
  "/:id/companies/:idCompany/bulk-import/template",
  auth,
  itemId,
  companyId,
  editItem,
  controller.downloadCompanyBulkTemplate,
);
router.post(
  "/:id/companies/:idCompany/bulk-import/preview",
  auth,
  itemId,
  companyId,
  editItem,
  bulkUploadMiddleware,
  controller.previewCompanyBulkImport,
);
router.post(
  "/:id/companies/:idCompany/bulk-import/confirm",
  auth,
  itemId,
  companyId,
  editItem,
  controller.confirmCompanyBulkImport,
);
router.post(
  "/:id/companies/:idCompany/collaborators",
  auth,
  itemId,
  companyId,
  editItem,
  controller.addCollaborator,
);
router.delete(
  "/:id/companies/:idCompany/collaborators/:linkId",
  auth,
  itemId,
  companyId,
  linkId,
  editItem,
  controller.removeCollaborator,
);
router.post(
  "/:id/companies/:idCompany/complete",
  auth,
  itemId,
  companyId,
  editItem,
  controller.completeCompany,
);
router.post(
  "/:id/sectors/:idSetor/companies",
  auth,
  itemId,
  setorId,
  ...readItem,
  controller.addSectorCompanies,
);
router.delete(
  "/:id/sectors/:idSetor/companies/:idCompany",
  auth,
  itemId,
  setorId,
  companyId,
  ...readItem,
  controller.removeSectorCompany,
);
router.post(
  "/:id/sectors/:idSetor/notify-companies",
  auth,
  itemId,
  setorId,
  ...readItem,
  controller.notifySectorCompanies,
);
router.post(
  "/:id/companies/:idCompany/notify-sector",
  auth,
  itemId,
  companyId,
  ...readItem,
  controller.notifySectorIndication,
);
router.post(
  "/:id/companies/:idCompany/notify-owner",
  auth,
  itemId,
  companyId,
  ...readItem,
  controller.notifyOwnerValidated,
);

module.exports = router;
