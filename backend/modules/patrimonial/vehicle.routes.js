const express = require("express");
const vehicleController = require("./vehicle.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { bulkUploadMiddleware } = require("../../middleware/upload.middleware");

const router = express.Router();
const canView = [authMiddleware, authorizePermission("fleet", "view")];
const canCreate = [authMiddleware, authorizePermission("fleet", "create")];
const canEdit = [authMiddleware, authorizePermission("fleet", "edit")];
const canDelete = [authMiddleware, authorizePermission("fleet", "delete")];

router.get("/", ...canView, vehicleController.list);
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
router.get("/:id", ...canView, vehicleController.getById);
router.post("/", ...canCreate, vehicleController.create);
router.put("/:id", ...canEdit, vehicleController.update);
router.post("/:id/blacklist", ...canEdit, vehicleController.addBlacklist);
router.delete("/:id/blacklist", ...canEdit, vehicleController.removeBlacklist);
router.delete("/:id", ...canDelete, vehicleController.deleteVehicle);

module.exports = router;
