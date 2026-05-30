const express = require("express");
const materialsController = require("./materials.controller");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");
const { merchandisePhotoMiddleware } = require("../../middleware/upload.middleware");

const router = express.Router();
const adminOnly = [authMiddleware, authorizeRoles("ADMIN")];
const operatorRoles = [authMiddleware, authorizeRoles("ADMIN", "CONTROLADOR")];

router.get("/companies/select", ...operatorRoles, materialsController.listCompaniesSelect);
router.get("/vehicles/select", ...operatorRoles, materialsController.listVehiclesSelect);
router.get("/locations/select", ...operatorRoles, materialsController.listLocationsSelect);
router.get("/products/select", ...operatorRoles, materialsController.listProductsSelect);

router.get("/locations", ...adminOnly, materialsController.listLocations);
router.post("/locations", ...adminOnly, materialsController.createLocation);
router.put("/locations/:id", ...adminOnly, materialsController.updateLocation);

router.get("/products", ...adminOnly, materialsController.listProducts);
router.post("/products", ...adminOnly, materialsController.createProduct);
router.put("/products/:id", ...adminOnly, materialsController.updateProduct);

router.post(
  "/movements/in",
  ...operatorRoles,
  merchandisePhotoMiddleware,
  materialsController.movementIn,
);
router.post(
  "/movements/out",
  ...operatorRoles,
  merchandisePhotoMiddleware,
  materialsController.movementOut,
);

router.get("/stock", ...adminOnly, materialsController.getStock);
router.get("/history", ...adminOnly, materialsController.getHistory);
router.get("/dashboard", ...adminOnly, materialsController.getDashboard);

module.exports = router;
