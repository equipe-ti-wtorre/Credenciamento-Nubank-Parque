const express = require("express");
const eventController = require("./event.controller");
const typesRoutes = require("./types.routes");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();
const adminOnly = [authMiddleware, authorizeRoles("ADMIN")];

router.use(typesRoutes);

router.get("/", authMiddleware, eventController.list);
router.post("/", ...adminOnly, eventController.create);
router.post(
  "/days/:id_event_day/companies",
  ...adminOnly,
  eventController.addCompanyToDay,
);
router.delete(
  "/days/companies/:id_event_day_company",
  ...adminOnly,
  eventController.removeCompanyFromDay,
);
router.get("/:id", authMiddleware, eventController.getById);

module.exports = router;
