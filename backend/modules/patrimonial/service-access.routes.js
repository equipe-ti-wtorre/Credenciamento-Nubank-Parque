const express = require("express");
const serviceAccessController = require("./service-access.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const {
  authorizePermission,
  authorizeAnyPermission,
} = require("../../middleware/permissionMiddleware");
const { bulkUploadMiddleware } = require("../../middleware/upload.middleware");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("service_access", "view")];
const canCreate = [authMiddleware, authorizePermission("service_access", "create")];
const canEdit = [authMiddleware, authorizePermission("service_access", "edit")];
/** Criação de solicitação (rascunho) e manutenção: create ou edit. */
const canMutate = [
  authMiddleware,
  authorizeAnyPermission([
    { modulo: "service_access", acao: "create" },
    { modulo: "service_access", acao: "edit" },
  ]),
];

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
router.post(
  "/validate-collaborators-overlap",
  ...canCreate,
  serviceAccessController.validateCollaboratorsOverlap,
);
router.get("/:id", ...canView, serviceAccessController.getById);
router.get(
  "/:id/bulk-import/template",
  ...canView,
  serviceAccessController.downloadUnifiedBulkTemplate,
);
router.post(
  "/:id/bulk-import/preview",
  ...canMutate,
  bulkUploadMiddleware,
  serviceAccessController.unifiedBulkPreview,
);
router.post(
  "/:id/bulk-import/confirm",
  ...canMutate,
  serviceAccessController.unifiedBulkConfirm,
);
router.put("/:id", ...canMutate, serviceAccessController.update);
router.put("/:id/relations", ...canMutate, serviceAccessController.syncRelations);
router.patch("/:id/period", ...canMutate, serviceAccessController.patchPeriod);
router.patch("/:id/status", ...canEdit, serviceAccessController.patchStatus);
router.patch("/:id/enabled", ...canEdit, serviceAccessController.patchEnabled);
router.post(
  "/:id/collaborators/bulk/preview",
  ...canMutate,
  bulkUploadMiddleware,
  serviceAccessController.bulkCollaboratorsPreview,
);
router.post(
  "/:id/collaborators/bulk/commit",
  ...canMutate,
  serviceAccessController.bulkCollaboratorsCommit,
);
router.post(
  "/:id/collaborators/bulk",
  ...canMutate,
  bulkUploadMiddleware,
  serviceAccessController.bulkCollaborators,
);
router.post("/:id/collaborators", ...canMutate, serviceAccessController.addCollaborator);
router.delete(
  "/:id/collaborators/:linkId",
  ...canMutate,
  serviceAccessController.removeCollaborator,
);
router.post(
  "/:id/vehicles/bulk/preview",
  ...canMutate,
  bulkUploadMiddleware,
  serviceAccessController.bulkVehiclesPreview,
);
router.post(
  "/:id/vehicles/bulk/commit",
  ...canMutate,
  serviceAccessController.bulkVehiclesCommit,
);
router.post(
  "/:id/vehicles/bulk",
  ...canMutate,
  bulkUploadMiddleware,
  serviceAccessController.bulkVehicles,
);
router.post("/:id/vehicles", ...canMutate, serviceAccessController.addVehicle);
router.delete("/:id/vehicles/:linkId", ...canMutate, serviceAccessController.removeVehicle);

module.exports = router;
