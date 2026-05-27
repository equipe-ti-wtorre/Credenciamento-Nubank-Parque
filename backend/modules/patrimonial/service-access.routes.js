const express = require("express");
const serviceAccessController = require("./service-access.controller");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();
const serviceRoles = [authMiddleware, authorizeRoles("ADMIN", "PRODUTORA", "PADRAO")];
const adminRoles = [authMiddleware, authorizeRoles("ADMIN")];

router.get("/", ...serviceRoles, serviceAccessController.list);
router.get("/:id", ...serviceRoles, serviceAccessController.getById);
router.post("/", ...serviceRoles, serviceAccessController.create);
router.patch("/:id/status", ...adminRoles, serviceAccessController.patchStatus);

module.exports = router;
