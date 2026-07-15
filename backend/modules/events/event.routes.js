const express = require("express");
const eventController = require("./event.controller");
const typesRoutes = require("./types.routes");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("events", "view")];
const canCreate = [auth, authorizePermission("events", "create")];
const canEdit = [auth, authorizePermission("events", "edit")];
const canDelete = [auth, authorizePermission("events", "delete")];

router.use(typesRoutes);

router.get("/", ...canView, eventController.list);
router.post("/", ...canCreate, eventController.create);
router.patch("/:id/period", ...canEdit, eventController.updatePeriod);
router.patch("/:id/preferences", ...canView, eventController.updatePreferences);
router.post(
  "/days/:id_event_day/companies",
  ...canEdit,
  eventController.addCompanyToDay,
);
router.delete(
  "/days/companies/:id_event_day_company",
  ...canDelete,
  eventController.removeCompanyFromDay,
);
router.get("/:id", ...canView, eventController.getById);

module.exports = router;
