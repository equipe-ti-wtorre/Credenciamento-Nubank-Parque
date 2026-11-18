const express = require("express");
const collaboratorController = require("./collaborator.controller");
const domainRoutes = require("./domain.routes");
const { authMiddleware } = require("../../middleware/authMiddleware");
const {
  authorizePermission,
  authorizeAnyPermission,
} = require("../../middleware/permissionMiddleware");
const { bulkUploadMiddleware, pictureUploadMiddleware } = require("../../middleware/upload.middleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoColaborador } = require("../../middleware/vinculos");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("collaborators", "view")];
const canCreate = [auth, authorizePermission("collaborators", "create")];
const canEdit = [auth, authorizePermission("collaborators", "edit")];
const canUploadPicture = [
  auth,
  authorizeAnyPermission([
    { modulo: "collaborators", acao: "edit" },
    { modulo: "collaborators", acao: "create" },
  ]),
];
const canDelete = [auth, authorizePermission("collaborators", "delete")];
const canSearch = [
  auth,
  authorizeAnyPermission([
    { modulo: "collaborators", acao: "view" },
    { modulo: "collaborators", acao: "create" },
    { modulo: "gate", acao: "view" },
    { modulo: "merchandise_entry", acao: "view" },
    { modulo: "merchandise_exit", acao: "view" },
    { modulo: "event_accreditation", acao: "view" },
    { modulo: "event_accreditation", acao: "edit" },
  ]),
];
const collaboratorId = resolverPublicId({
  param: "id",
  table: "collaborator",
  pk: "id_collaborator",
});
const viewCollaborator = autorizar({
  modulo: "collaborators",
  acao: "view",
  vinculo: vinculoColaborador,
});
const editCollaborator = autorizar({
  modulo: "collaborators",
  acao: "edit",
  vinculo: vinculoColaborador,
});
const uploadCollaborator = autorizar({
  any: [
    { modulo: "collaborators", acao: "edit" },
    { modulo: "collaborators", acao: "create" },
  ],
  vinculo: vinculoColaborador,
});
const deleteCollaborator = autorizar({
  modulo: "collaborators",
  acao: "delete",
  vinculo: vinculoColaborador,
});

router.use(domainRoutes);

router.get("/search", ...canSearch, collaboratorController.search);
router.get("/stats/summary", ...canView, collaboratorController.statsSummary);
router.get("/", ...canView, collaboratorController.list);
router.get(
  "/bulk/template",
  ...canView,
  collaboratorController.downloadBulkTemplate,
);
router.post(
  "/bulk/preview",
  ...canCreate,
  bulkUploadMiddleware,
  collaboratorController.bulkPreview,
);
router.post(
  "/bulk/commit",
  ...canCreate,
  collaboratorController.bulkCommit,
);
router.post(
  "/bulk",
  ...canCreate,
  bulkUploadMiddleware,
  collaboratorController.bulkCreate,
);
router.get(
  "/:id/access-details",
  auth,
  collaboratorId,
  viewCollaborator,
  collaboratorController.getAccessDetails,
);
router.get("/:id", auth, collaboratorId, viewCollaborator, collaboratorController.getById);
router.post("/", ...canCreate, collaboratorController.create);
router.post(
  "/:id/picture",
  auth,
  collaboratorId,
  uploadCollaborator,
  pictureUploadMiddleware,
  collaboratorController.uploadPicture,
);
router.delete("/:id/picture", auth, collaboratorId, editCollaborator, collaboratorController.deletePicture);
router.get("/:id/facial-status", auth, collaboratorId, viewCollaborator, collaboratorController.getFacialStatus);
router.post("/:id/facial-enroll", auth, collaboratorId, editCollaborator, collaboratorController.facialEnroll);
router.post("/:id/facial-revoke", auth, collaboratorId, editCollaborator, collaboratorController.facialRevoke);
router.post("/:id/facial-retry", auth, collaboratorId, editCollaborator, collaboratorController.facialRetry);
router.put("/:id", auth, collaboratorId, editCollaborator, collaboratorController.update);
router.patch("/:id/status", auth, collaboratorId, editCollaborator, collaboratorController.patchStatus);
router.delete("/:id", auth, collaboratorId, deleteCollaborator, collaboratorController.deleteCollaborator);

module.exports = router;
