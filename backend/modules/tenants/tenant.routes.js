const express = require("express");
const tenantController = require("./tenant.controller");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();

router.get("/msal-config", tenantController.getMsalConfig);
router.get("/status", authMiddleware, authorizeRoles("ADMIN"), tenantController.status);
router.get("/", authMiddleware, authorizeRoles("ADMIN"), tenantController.list);
router.get("/:id", authMiddleware, authorizeRoles("ADMIN"), tenantController.getById);
router.post("/", authMiddleware, authorizeRoles("ADMIN"), tenantController.create);
router.put("/:id", authMiddleware, authorizeRoles("ADMIN"), tenantController.update);
router.delete("/:id", authMiddleware, authorizeRoles("ADMIN"), tenantController.remove);

module.exports = router;
