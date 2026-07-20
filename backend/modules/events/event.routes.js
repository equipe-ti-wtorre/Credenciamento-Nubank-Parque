const express = require("express");
const eventController = require("./event.controller");
const typesRoutes = require("./types.routes");
const { authMiddleware } = require("../../middleware/authMiddleware");
const {
  authorizePermission,
  authorizeAnyPermission,
} = require("../../middleware/permissionMiddleware");

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
const canDelete = [auth, authorizePermission("events", "delete")];

router.use(typesRoutes);

router.get("/producers", ...canCreate, eventController.listProducers);
router.get("/", ...canViewOrApprove, eventController.list);
router.post("/", ...canCreate, eventController.create);
router.get("/:id/linkable-companies", ...canEdit, eventController.listLinkableCompanies);
router.patch("/:id/period", ...canEdit, eventController.updatePeriod);
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
router.get("/:id", ...canViewOrApprove, eventController.getById);

module.exports = router;
