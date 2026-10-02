const express = require("express");
const collaboratorController = require("./collaborator.controller");
const domainRoutes = require("./domain.routes");
const { authMiddleware } = require("../../middleware/authMiddleware");
const {
  authorizePermission,
  authorizeAnyPermission,
} = require("../../middleware/permissionMiddleware");
const { bulkUploadMiddleware, pictureUploadMiddleware } = require("../../middleware/upload.middleware");

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
  ...canView,
  collaboratorController.getAccessDetails,
);
router.get("/:id", ...canView, collaboratorController.getById);
router.post("/", ...canCreate, collaboratorController.create);
router.post(
  "/:id/picture",
  ...canUploadPicture,
  pictureUploadMiddleware,
  collaboratorController.uploadPicture,
);
router.delete("/:id/picture", ...canEdit, collaboratorController.deletePicture);
router.get("/:id/facial-status", ...canView, collaboratorController.getFacialStatus);
router.post("/:id/facial-enroll", ...canEdit, collaboratorController.facialEnroll);
router.post("/:id/facial-revoke", ...canEdit, collaboratorController.facialRevoke);
router.post("/:id/facial-retry", ...canEdit, collaboratorController.facialRetry);
router.put("/:id", ...canEdit, collaboratorController.update);
router.patch("/:id/status", ...canEdit, collaboratorController.patchStatus);
router.delete("/:id", ...canDelete, collaboratorController.deleteCollaborator);

module.exports = router;
