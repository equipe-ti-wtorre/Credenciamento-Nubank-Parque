const express = require("express");
const eventController = require("./event.controller");
const typesRoutes = require("./types.routes");
const { authMiddleware } = require("../../middleware/authMiddleware");
const {
  authorizePermission,
  authorizeAnyPermission,
} = require("../../middleware/permissionMiddleware");
const {
  bulkUploadMiddleware,
  coverUploadMiddleware,
} = require("../../middleware/upload.middleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoEvento } = require("../../middleware/vinculos");

const router = express.Router();
const auth = authMiddleware;
const eventView = [
  { modulo: "events", acao: "view" },
  { modulo: "approvals", acao: "view" },
];
const eventDelete = [
  { modulo: "events", acao: "delete" },
  { modulo: "events", acao: "edit" },
];
const eventToggle = [
  { modulo: "events", acao: "edit" },
  { modulo: "events", acao: "create" },
];
const canView = [auth, authorizePermission("events", "view")];
const canViewOrApprove = [auth, authorizeAnyPermission(eventView)];
const canCreate = [auth, authorizePermission("events", "create")];
const canEdit = [auth, authorizePermission("events", "edit")];
const canDelete = [auth, authorizeAnyPermission(eventDelete)];
const canToggleActive = [auth, authorizeAnyPermission(eventToggle)];

const eventId = resolverPublicId({ param: "id", table: "event", pk: "id_event" });
const companyId = resolverPublicId({ param: "idCompany", table: "company", pk: "id_company" });
const vehicleId = resolverPublicId({ param: "idVehicle", table: "vehicle", pk: "id_vehicle" });
const eventDayId = resolverPublicId({
  param: "id_event_day",
  table: "event_day",
  pk: "id_event_day",
});
const eventDayCompanyId = resolverPublicId({
  param: "id_event_day_company",
  table: "event_day_company",
  pk: "id_event_day_company",
});
const readEvent = autorizar({ any: eventView, vinculo: vinculoEvento });
const editEvent = autorizar({ modulo: "events", acao: "edit", vinculo: vinculoEvento });
const deleteEvent = autorizar({ any: eventDelete, vinculo: vinculoEvento });
const toggleEvent = autorizar({ any: eventToggle, vinculo: vinculoEvento });

router.use(typesRoutes);

router.get("/producers", ...canCreate, eventController.listProducers);
router.get("/", ...canViewOrApprove, eventController.list);
router.post("/", ...canCreate, eventController.create);
router.get("/:id/linkable-companies", auth, eventId, editEvent, eventController.listLinkableCompanies);
router.post("/:id/cover", auth, eventId, toggleEvent, coverUploadMiddleware, eventController.uploadCover);
router.patch("/:id/period", auth, eventId, editEvent, eventController.updatePeriod);
router.patch("/:id/responsavel", auth, eventId, editEvent, eventController.updateResponsavel);
router.patch("/:id/status", auth, eventId, toggleEvent, eventController.patchStatus);
router.patch("/:id/preferences", auth, eventId, readEvent, eventController.updatePreferences);
router.post("/:id/submit-approval", auth, eventId, editEvent, eventController.submitApproval);
router.post(
  "/:id/companies/:idCompany/notify-complete",
  auth,
  eventId,
  companyId,
  editEvent,
  eventController.notifyCompanyComplete,
);
router.post(
  "/days/:id_event_day/companies",
  auth,
  eventDayId,
  editEvent,
  eventController.addCompanyToDay,
);
router.delete(
  "/days/companies/:id_event_day_company",
  auth,
  eventDayCompanyId,
  editEvent,
  eventController.removeCompanyFromDay,
);
router.put(
  "/:id/companies/:idCompany/phases",
  auth,
  eventId,
  companyId,
  editEvent,
  eventController.syncCompanyPhases,
);
router.delete(
  "/:id/companies/:idCompany",
  auth,
  eventId,
  companyId,
  editEvent,
  eventController.removeCompanyFromEvent,
);
router.post(
  "/:id/companies/:idCompany/credentials/bulk/preview",
  auth,
  eventId,
  companyId,
  editEvent,
  bulkUploadMiddleware,
  eventController.bulkPreviewCompanyCredentials,
);
router.post(
  "/:id/companies/:idCompany/credentials/bulk/commit",
  auth,
  eventId,
  companyId,
  editEvent,
  eventController.bulkCommitCompanyCredentials,
);
router.get("/:id/vehicle-counts", auth, eventId, readEvent, eventController.listVehicleCounts);
router.get(
  "/:id/companies/:idCompany/vehicles",
  auth,
  eventId,
  companyId,
  readEvent,
  eventController.listCompanyVehicles,
);
router.post(
  "/:id/companies/:idCompany/vehicles",
  auth,
  eventId,
  companyId,
  editEvent,
  eventController.addCompanyVehicle,
);
router.delete(
  "/:id/companies/:idCompany/vehicles/:idVehicle",
  auth,
  eventId,
  companyId,
  vehicleId,
  editEvent,
  eventController.removeCompanyVehicle,
);
router.delete(
  "/:id/companies/:idCompany/vehicles",
  auth,
  eventId,
  companyId,
  editEvent,
  eventController.removeCompanyVehicles,
);
router.delete(
  "/:id/companies/:idCompany/credentials",
  auth,
  eventId,
  companyId,
  editEvent,
  eventController.removeCompanyCredentials,
);
router.get(
  "/:id/companies/:idCompany/bulk-import/template",
  auth,
  eventId,
  companyId,
  editEvent,
  eventController.downloadCompanyBulkTemplate,
);
router.post(
  "/:id/companies/:idCompany/bulk-import/preview",
  auth,
  eventId,
  companyId,
  editEvent,
  bulkUploadMiddleware,
  eventController.previewCompanyBulkImport,
);
router.post(
  "/:id/companies/:idCompany/bulk-import/confirm",
  auth,
  eventId,
  companyId,
  editEvent,
  eventController.confirmCompanyBulkImport,
);
router.delete("/:id", auth, eventId, deleteEvent, eventController.remove);
router.get("/:id", auth, eventId, readEvent, eventController.getById);

module.exports = router;
