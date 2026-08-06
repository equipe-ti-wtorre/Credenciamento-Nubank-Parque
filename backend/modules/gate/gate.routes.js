const express = require("express");
const gateController = require("./gate.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("gate", "view")];
const canCreate = [authMiddleware, authorizePermission("gate", "create")];
const canEdit = [authMiddleware, authorizePermission("gate", "edit")];

router.get("/events/today", ...canView, gateController.listTodayEvents);
router.post("/events/validate", ...canCreate, gateController.validateEvent);
router.post("/events/substitute", ...canEdit, gateController.substituteEvent);
router.get("/calendar", ...canView, gateController.listCalendar);
router.get("/calendar/detail", ...canView, gateController.getCalendarDetail);
router.get("/services/today", ...canView, gateController.listTodayServices);
router.post("/services/validate", ...canCreate, gateController.validateService);
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
  ...canCreate,
  gateController.notifyPendingServiceApproval,
);
router.post(
  "/services/:id/cancel-approval",
  ...canCreate,
  gateController.cancelPendingServiceApproval,
);

module.exports = router;
