const express = require("express");
const serviceAccessController = require("./service-access.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { bulkUploadMiddleware } = require("../../middleware/upload.middleware");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("service_access", "view")];
const canCreate = [authMiddleware, authorizePermission("service_access", "create")];
const canEdit = [authMiddleware, authorizePermission("service_access", "edit")];

router.get("/", ...canView, serviceAccessController.list);
router.get(
  "/bulk-template/collaborators",
  ...canView,
  serviceAccessController.downloadCollaboratorsBulkTemplate,
);
router.get(
  "/bulk-template/vehicles",
  ...canView,
  serviceAccessController.downloadVehiclesBulkTemplate,
);
router.post("/", ...canCreate, serviceAccessController.create);
router.get("/:id", ...canView, serviceAccessController.getById);
router.get(
  "/:id/bulk-import/template",
  ...canView,
  serviceAccessController.downloadUnifiedBulkTemplate,
);
router.post(
  "/:id/bulk-import/preview",
  ...canEdit,
  bulkUploadMiddleware,
  serviceAccessController.unifiedBulkPreview,
);
router.post(
  "/:id/bulk-import/confirm",
  ...canEdit,
  serviceAccessController.unifiedBulkConfirm,
);
router.put("/:id", ...canEdit, serviceAccessController.update);
router.put("/:id/relations", ...canEdit, serviceAccessController.syncRelations);
router.patch("/:id/period", ...canEdit, serviceAccessController.patchPeriod);
router.patch("/:id/status", ...canEdit, serviceAccessController.patchStatus);
router.patch("/:id/enabled", ...canEdit, serviceAccessController.patchEnabled);
router.post(
  "/:id/collaborators/bulk/preview",
  ...canEdit,
  bulkUploadMiddleware,
  serviceAccessController.bulkCollaboratorsPreview,
);
router.post(
  "/:id/collaborators/bulk/commit",
  ...canEdit,
  serviceAccessController.bulkCollaboratorsCommit,
);
router.post(
  "/:id/collaborators/bulk",
  ...canEdit,
  bulkUploadMiddleware,
  serviceAccessController.bulkCollaborators,
);
router.post("/:id/collaborators", ...canEdit, serviceAccessController.addCollaborator);
router.delete(
  "/:id/collaborators/:linkId",
  ...canEdit,
  serviceAccessController.removeCollaborator,
);
router.post(
  "/:id/vehicles/bulk/preview",
  ...canEdit,
  bulkUploadMiddleware,
  serviceAccessController.bulkVehiclesPreview,
);
router.post(
  "/:id/vehicles/bulk/commit",
  ...canEdit,
  serviceAccessController.bulkVehiclesCommit,
);
router.post(
  "/:id/vehicles/bulk",
  ...canEdit,
  bulkUploadMiddleware,
  serviceAccessController.bulkVehicles,
);
router.post("/:id/vehicles", ...canEdit, serviceAccessController.addVehicle);
router.delete("/:id/vehicles/:linkId", ...canEdit, serviceAccessController.removeVehicle);

module.exports = router;
