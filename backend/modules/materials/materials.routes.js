const express = require("express");
const materialsController = require("./materials.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const {
  authorizePermission,
  authorizeAnyPermission,
} = require("../../middleware/permissionMiddleware");
const {
  merchandisePhotoMiddleware,
  merchandisePhotosMiddleware,
} = require("../../middleware/upload.middleware");

const router = express.Router();
const auth = authMiddleware;
const productsView = [auth, authorizePermission("merchandise_products", "view")];
const productsCreate = [
  auth,
  authorizeAnyPermission([
    { modulo: "merchandise_products", acao: "create" },
    { modulo: "merchandise_entry", acao: "create" },
    { modulo: "merchandise_exit", acao: "create" },
  ]),
];
const productsEdit = [auth, authorizePermission("merchandise_products", "edit")];
const locationsView = [auth, authorizePermission("merchandise_locations", "view")];
const locationsCreate = [auth, authorizePermission("merchandise_locations", "create")];
const locationsEdit = [auth, authorizePermission("merchandise_locations", "edit")];
const entryCreate = [auth, authorizePermission("merchandise_entry", "create")];
const exitCreate = [auth, authorizePermission("merchandise_exit", "create")];
const reportsView = [auth, authorizePermission("merchandise_reports", "view")];
const extCompaniesView = [auth, authorizePermission("merchandise_external_companies", "view")];
const extCompaniesEdit = [auth, authorizePermission("merchandise_external_companies", "edit")];
const movementCatalogView = [
  auth,
  authorizeAnyPermission([
    { modulo: "merchandise_entry", acao: "view" },
    { modulo: "merchandise_exit", acao: "view" },
  ]),
];
const parseInvoiceAccess = [
  auth,
  authorizeAnyPermission([
    { modulo: "merchandise_entry", acao: "create" },
    { modulo: "merchandise_exit", acao: "create" },
    { modulo: "merchandise_entry", acao: "view" },
    { modulo: "merchandise_exit", acao: "view" },
  ]),
];

router.get("/companies/select", ...movementCatalogView, materialsController.listCompaniesSelect);
router.get("/vehicles/select", ...movementCatalogView, materialsController.listVehiclesSelect);
router.get("/locations/select", ...movementCatalogView, materialsController.listLocationsSelect);
router.get("/products/select", ...movementCatalogView, materialsController.listProductsSelect);

router.get("/locations", ...locationsView, materialsController.listLocations);
router.post("/locations", ...locationsCreate, materialsController.createLocation);
router.put("/locations/:id", ...locationsEdit, materialsController.updateLocation);

router.get("/products", ...productsView, materialsController.listProducts);
router.post("/products", ...productsCreate, materialsController.createProduct);
router.put("/products/:id", ...productsEdit, materialsController.updateProduct);

router.get(
  "/movements/lookup-plate",
  ...movementCatalogView,
  materialsController.lookupPlate,
);
router.post(
  "/movements/parse-invoice",
  ...parseInvoiceAccess,
  merchandisePhotoMiddleware,
  materialsController.parseInvoice,
);
router.post(
  "/movements/in",
  ...entryCreate,
  merchandisePhotosMiddleware,
  materialsController.movementIn,
);
router.post(
  "/movements/out",
  ...exitCreate,
  merchandisePhotosMiddleware,
  materialsController.movementOut,
);

router.get(
  "/external-companies/suggest",
  ...movementCatalogView,
  materialsController.suggestExternalCompanies,
);
router.get("/external-companies", ...extCompaniesView, materialsController.listExternalCompanies);
router.patch(
  "/external-companies/:id",
  ...extCompaniesEdit,
  materialsController.patchExternalCompany,
);
router.post(
  "/external-companies/:id/merge",
  ...extCompaniesEdit,
  materialsController.mergeExternalCompanies,
);

router.get("/stock", ...reportsView, materialsController.getStock);
router.get("/stock/reconcile", ...reportsView, materialsController.getStockReconcile);
router.get("/history", ...reportsView, materialsController.getHistory);
router.get("/dashboard", ...reportsView, materialsController.getDashboard);

module.exports = router;
