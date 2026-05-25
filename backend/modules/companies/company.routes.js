const express = require("express");
const companyController = require("./company.controller");
const typesRoutes = require("./types.routes");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();
const adminOnly = [authMiddleware, authorizeRoles("ADMIN")];

router.use(typesRoutes);

router.get("/", authMiddleware, companyController.list);
router.get("/:id", authMiddleware, companyController.getById);
router.post("/", ...adminOnly, companyController.create);
router.put("/:id", ...adminOnly, companyController.update);
router.patch("/:id/status", ...adminOnly, companyController.patchStatus);

module.exports = router;
