const express = require("express");
const eventController = require("./event.controller");
const typesRoutes = require("./types.routes");
const { authMiddleware } = require("../../middleware/authMiddleware");
const {
  authorizePermission,
  authorizeAnyPermission,
} = require("../../middleware/permissionMiddleware");
const { bulkUploadMiddleware } = require("../../middleware/upload.middleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("events", "view")];
const canViewOrApprove = [
  auth,
  authorizeAnyPermission([
    { modulo: "events", acao: "view" },
    { modulo: "approvals", acao: "view" },
  ]),
];
const canCreate = [auth, authorizePermission("events", "create")];
const canEdit = [auth, authorizePermission("events", "edit")];
const canDelete = [
  auth,
  authorizeAnyPermission([
    { modulo: "events", acao: "delete" },
    { modulo: "events", acao: "edit" },
  ]),
];
const canToggleActive = [
  auth,
  authorizeAnyPermission([
    { modulo: "events", acao: "edit" },
    { modulo: "events", acao: "create" },
  ]),
];

router.use(typesRoutes);

router.get("/producers", ...canCreate, eventController.listProducers);
router.get("/", ...canViewOrApprove, eventController.list);
router.post("/", ...canCreate, eventController.create);
router.get("/:id/linkable-companies", ...canEdit, eventController.listLinkableCompanies);
router.patch("/:id/period", ...canEdit, eventController.updatePeriod);
router.patch("/:id/responsavel", ...canEdit, eventController.updateResponsavel);
router.patch("/:id/status", ...canToggleActive, eventController.patchStatus);
router.patch("/:id/preferences", ...canViewOrApprove, eventController.updatePreferences);
router.post(
  "/days/:id_event_day/companies",
  ...canEdit,
  eventController.addCompanyToDay,
);
router.delete(
  "/days/companies/:id_event_day_company",
  ...canEdit,
  eventController.removeCompanyFromDay,
);
router.put(
  "/:id/companies/:idCompany/phases",
  ...canEdit,
  eventController.syncCompanyPhases,
);
router.post(
  "/:id/companies/:idCompany/credentials/bulk/preview",
  ...canEdit,
  bulkUploadMiddleware,
  eventController.bulkPreviewCompanyCredentials,
);
router.post(
  "/:id/companies/:idCompany/credentials/bulk/commit",
  ...canEdit,
  eventController.bulkCommitCompanyCredentials,
);
router.get(
  "/:id/vehicle-counts",
  ...canViewOrApprove,
  eventController.listVehicleCounts,
);
router.get(
  "/:id/companies/:idCompany/vehicles",
  ...canViewOrApprove,
  eventController.listCompanyVehicles,
);
router.post(
  "/:id/companies/:idCompany/vehicles",
  ...canEdit,
  eventController.addCompanyVehicle,
);
router.delete(
  "/:id/companies/:idCompany/vehicles/:idVehicle",
  ...canEdit,
  eventController.removeCompanyVehicle,
);
router.get(
  "/:id/companies/:idCompany/bulk-import/template",
  ...canEdit,
  eventController.downloadCompanyBulkTemplate,
);
router.post(
  "/:id/companies/:idCompany/bulk-import/preview",
  ...canEdit,
  bulkUploadMiddleware,
  eventController.previewCompanyBulkImport,
);
router.post(
  "/:id/companies/:idCompany/bulk-import/confirm",
  ...canEdit,
  eventController.confirmCompanyBulkImport,
);
router.delete("/:id", ...canDelete, eventController.remove);
router.get("/:id", ...canViewOrApprove, eventController.getById);

module.exports = router;
