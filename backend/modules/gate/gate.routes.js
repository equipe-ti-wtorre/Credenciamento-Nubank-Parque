const express = require("express");
const gateController = require("./gate.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoAcessoServico } = require("../../middleware/vinculos");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("gate", "view")];
const canCreate = [authMiddleware, authorizePermission("gate", "create")];
const canEdit = [authMiddleware, authorizePermission("gate", "edit")];
const serviceId = resolverPublicId({
  param: "id",
  table: "service_access",
  pk: "id_service_access",
});
const viewService = autorizar({ modulo: "gate", acao: "view", vinculo: vinculoAcessoServico });
const createService = autorizar({ modulo: "gate", acao: "create", vinculo: vinculoAcessoServico });

router.get("/events/today", ...canView, gateController.listTodayEvents);
router.post("/events/validate", ...canCreate, gateController.validateEvent);
router.post("/events/facial-enroll", ...canCreate, gateController.resendEventFacial);
router.post("/events/substitute", ...canEdit, gateController.substituteEvent);
router.get("/calendar", ...canView, gateController.listCalendar);
router.get("/calendar/detail", ...canView, gateController.getCalendarDetail);
router.get("/services/today", ...canView, gateController.listTodayServices);
router.get("/services/:id/authorizers", authMiddleware, serviceId, viewService, gateController.getServiceAuthorizers);
router.post("/services/validate", ...canCreate, gateController.validateService);
router.post("/services/facial-enroll", ...canCreate, gateController.resendServiceFacial);
router.post("/services/substitute", ...canEdit, gateController.substituteService);

router.get("/manual-release/meta", ...canView, gateController.manualReleaseMeta);
router.get(
  "/manual-release/collaborators/search",
  ...canView,
  gateController.manualReleaseSearchCollaborator,
);
router.post("/services/manual-release", ...canCreate, gateController.createManualRelease);
router.post(
  "/services/:id/notify-approval",
  authMiddleware,
  serviceId,
  createService,
  gateController.notifyPendingServiceApproval,
);
router.post(
  "/services/:id/cancel-approval",
  authMiddleware,
  serviceId,
  createService,
  gateController.cancelPendingServiceApproval,
);

module.exports = router;
