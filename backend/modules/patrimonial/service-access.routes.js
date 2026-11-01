const express = require("express");
const serviceAccessController = require("./service-access.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const {
  authorizePermission,
  authorizeAnyPermission,
} = require("../../middleware/permissionMiddleware");
const { bulkUploadMiddleware } = require("../../middleware/upload.middleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoAcessoServico } = require("../../middleware/vinculos");

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
const serviceId = resolverPublicId({
  param: "id",
  table: "service_access",
  pk: "id_service_access",
});
const collabLinkId = resolverPublicId({
  param: "linkId",
  table: "service_access_collaborator",
  pk: "id_service_access_collaborator",
});
const vehicleLinkId = resolverPublicId({
  param: "linkId",
  table: "service_access_vehicle",
  pk: "id_service_access_vehicle",
});
const readService = autorizar({ modulo: "service_access", acao: "view", vinculo: vinculoAcessoServico });
const editService = autorizar({ modulo: "service_access", acao: "edit", vinculo: vinculoAcessoServico });
const mutateService = autorizar({
  any: [
    { modulo: "service_access", acao: "create" },
    { modulo: "service_access", acao: "edit" },
  ],
  vinculo: vinculoAcessoServico,
});

router.get("/", ...canView, serviceAccessController.list);
router.get("/companies", ...canCreate, serviceAccessController.listCompanies);
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
router.get("/:id", authMiddleware, serviceId, readService, serviceAccessController.getById);
router.delete("/:id/draft", authMiddleware, serviceId, mutateService, serviceAccessController.deleteDraft);
router.get(
  "/:id/bulk-import/template",
  authMiddleware,
  serviceId,
  readService,
  serviceAccessController.downloadUnifiedBulkTemplate,
);
router.post(
  "/:id/bulk-import/preview",
  authMiddleware,
  serviceId,
  mutateService,
  bulkUploadMiddleware,
  serviceAccessController.unifiedBulkPreview,
);
router.post(
  "/:id/bulk-import/confirm",
  authMiddleware,
  serviceId,
  mutateService,
  serviceAccessController.unifiedBulkConfirm,
);
router.put("/:id", authMiddleware, serviceId, mutateService, serviceAccessController.update);
router.put("/:id/relations", authMiddleware, serviceId, mutateService, serviceAccessController.syncRelations);
router.patch("/:id/period", authMiddleware, serviceId, mutateService, serviceAccessController.patchPeriod);
router.patch("/:id/status", authMiddleware, serviceId, editService, serviceAccessController.patchStatus);
router.patch("/:id/enabled", authMiddleware, serviceId, editService, serviceAccessController.patchEnabled);
router.post(
  "/:id/collaborators/bulk/preview",
  authMiddleware,
  serviceId,
  mutateService,
  bulkUploadMiddleware,
  serviceAccessController.bulkCollaboratorsPreview,
);
router.post(
  "/:id/collaborators/bulk/commit",
  authMiddleware,
  serviceId,
  mutateService,
  serviceAccessController.bulkCollaboratorsCommit,
);
router.post(
  "/:id/collaborators/bulk",
  authMiddleware,
  serviceId,
  mutateService,
  bulkUploadMiddleware,
  serviceAccessController.bulkCollaborators,
);
router.post("/:id/collaborators", authMiddleware, serviceId, mutateService, serviceAccessController.addCollaborator);
router.delete(
  "/:id/collaborators/:linkId",
  authMiddleware,
  serviceId,
  collabLinkId,
  mutateService,
  serviceAccessController.removeCollaborator,
);
router.post(
  "/:id/vehicles/bulk/preview",
  authMiddleware,
  serviceId,
  mutateService,
  bulkUploadMiddleware,
  serviceAccessController.bulkVehiclesPreview,
);
router.post(
  "/:id/vehicles/bulk/commit",
  authMiddleware,
  serviceId,
  mutateService,
  serviceAccessController.bulkVehiclesCommit,
);
router.post(
  "/:id/vehicles/bulk",
  authMiddleware,
  serviceId,
  mutateService,
  bulkUploadMiddleware,
  serviceAccessController.bulkVehicles,
);
router.post("/:id/vehicles", authMiddleware, serviceId, mutateService, serviceAccessController.addVehicle);
router.delete(
  "/:id/vehicles/:linkId",
  authMiddleware,
  serviceId,
  vehicleLinkId,
  mutateService,
  serviceAccessController.removeVehicle,
);

module.exports = router;
