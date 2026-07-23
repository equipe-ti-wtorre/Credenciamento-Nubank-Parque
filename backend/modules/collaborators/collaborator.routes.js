const express = require("express");
const collaboratorController = require("./collaborator.controller");
const documentChangeController = require("./document-change.controller");
const domainRoutes = require("./domain.routes");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { bulkUploadMiddleware, pictureUploadMiddleware } = require("../../middleware/upload.middleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("collaborators", "view")];
const canCreate = [auth, authorizePermission("collaborators", "create")];
const canEdit = [auth, authorizePermission("collaborators", "edit")];
const canDelete = [auth, authorizePermission("collaborators", "delete")];
const docApprovalsView = [auth, authorizePermission("document_approvals", "view")];
const docApprovalsEdit = [auth, authorizePermission("document_approvals", "edit")];

router.use(domainRoutes);

router.get("/search", ...canView, collaboratorController.search);
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
  "/document-change/pending/count",
  ...docApprovalsView,
  documentChangeController.countPending,
);
router.get(
  "/document-change/pending",
  ...docApprovalsView,
  documentChangeController.listPending,
);
router.patch(
  "/document-change/:id/status",
  ...docApprovalsEdit,
  documentChangeController.patchStatus,
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
  ...canEdit,
  pictureUploadMiddleware,
  collaboratorController.uploadPicture,
);
router.post(
  "/:id/document-change",
  ...canCreate,
  documentChangeController.create,
);
router.put("/:id", ...canEdit, collaboratorController.update);
router.patch("/:id/status", ...canEdit, collaboratorController.patchStatus);
router.post("/:id/blacklist", ...canEdit, collaboratorController.addBlacklist);
router.delete("/:id/blacklist", ...canEdit, collaboratorController.removeBlacklist);
router.delete("/:id", ...canDelete, collaboratorController.deleteCollaborator);

module.exports = router;
