const express = require("express");
const vehicleController = require("./vehicle.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { bulkUploadMiddleware } = require("../../middleware/upload.middleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoEmpresa } = require("../../middleware/vinculos");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("fleet", "view")];
const canCreate = [authMiddleware, authorizePermission("fleet", "create")];
const canEdit = [authMiddleware, authorizePermission("fleet", "edit")];
const canDelete = [authMiddleware, authorizePermission("fleet", "delete")];
const vehicleId = resolverPublicId({ param: "id", table: "vehicle", pk: "id_vehicle" });
const viewVehicle = autorizar({ modulo: "fleet", acao: "view", vinculo: vinculoEmpresa });
const editVehicle = autorizar({ modulo: "fleet", acao: "edit", vinculo: vinculoEmpresa });
const deleteVehicle = autorizar({ modulo: "fleet", acao: "delete", vinculo: vinculoEmpresa });

router.get("/", ...canView, vehicleController.list);
router.get("/stats/summary", ...canView, vehicleController.statsSummary);
router.get("/types", ...canView, vehicleController.listTypes);
router.get(
  "/bulk/template",
  ...canView,
  vehicleController.downloadBulkTemplate,
);
router.post(
  "/bulk/preview",
  ...canCreate,
  bulkUploadMiddleware,
  vehicleController.bulkPreview,
);
router.post(
  "/bulk/commit",
  ...canCreate,
  vehicleController.bulkCommit,
);
router.get("/:id", authMiddleware, vehicleId, viewVehicle, vehicleController.getById);
router.post("/", ...canCreate, vehicleController.create);
router.put("/:id", authMiddleware, vehicleId, editVehicle, vehicleController.update);
router.post("/:id/blocklist", authMiddleware, vehicleId, editVehicle, vehicleController.addBlocklist);
router.delete("/:id/blocklist", authMiddleware, vehicleId, editVehicle, vehicleController.removeBlocklist);
router.delete("/:id", authMiddleware, vehicleId, deleteVehicle, vehicleController.deleteVehicle);

module.exports = router;
