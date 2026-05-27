const express = require("express");
const vehicleController = require("./vehicle.controller");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();
const vehicleRoles = [authMiddleware, authorizeRoles("ADMIN", "PRODUTORA", "PADRAO")];

router.get("/", ...vehicleRoles, vehicleController.list);
router.get("/:id", ...vehicleRoles, vehicleController.getById);
router.post("/", ...vehicleRoles, vehicleController.create);
router.put("/:id", ...vehicleRoles, vehicleController.update);

module.exports = router;
