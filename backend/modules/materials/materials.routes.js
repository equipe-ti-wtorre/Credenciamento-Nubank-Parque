const express = require("express");
const materialsController = require("./materials.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { merchandisePhotoMiddleware } = require("../../middleware/upload.middleware");

const router = express.Router();
const auth = authMiddleware;
const productsView = [auth, authorizePermission("merchandise_products", "view")];
const productsCreate = [auth, authorizePermission("merchandise_products", "create")];
const productsEdit = [auth, authorizePermission("merchandise_products", "edit")];
const locationsView = [auth, authorizePermission("merchandise_locations", "view")];
const locationsCreate = [auth, authorizePermission("merchandise_locations", "create")];
const locationsEdit = [auth, authorizePermission("merchandise_locations", "edit")];
const entryView = [auth, authorizePermission("merchandise_entry", "view")];
const entryCreate = [auth, authorizePermission("merchandise_entry", "create")];
const exitView = [auth, authorizePermission("merchandise_exit", "view")];
const exitCreate = [auth, authorizePermission("merchandise_exit", "create")];
const reportsView = [auth, authorizePermission("merchandise_reports", "view")];

router.get("/companies/select", ...entryView, materialsController.listCompaniesSelect);
router.get("/vehicles/select", ...entryView, materialsController.listVehiclesSelect);
router.get("/locations/select", ...entryView, materialsController.listLocationsSelect);
router.get("/products/select", ...entryView, materialsController.listProductsSelect);

router.get("/locations", ...locationsView, materialsController.listLocations);
router.post("/locations", ...locationsCreate, materialsController.createLocation);
router.put("/locations/:id", ...locationsEdit, materialsController.updateLocation);

router.get("/products", ...productsView, materialsController.listProducts);
router.post("/products", ...productsCreate, materialsController.createProduct);
router.put("/products/:id", ...productsEdit, materialsController.updateProduct);

router.post(
  "/movements/in",
  ...entryCreate,
  merchandisePhotoMiddleware,
  materialsController.movementIn,
);
router.post(
  "/movements/out",
  ...exitCreate,
  merchandisePhotoMiddleware,
  materialsController.movementOut,
);

router.get("/stock", ...reportsView, materialsController.getStock);
router.get("/history", ...reportsView, materialsController.getHistory);
router.get("/dashboard", ...reportsView, materialsController.getDashboard);

module.exports = router;
