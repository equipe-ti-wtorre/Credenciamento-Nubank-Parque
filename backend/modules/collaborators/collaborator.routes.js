const express = require("express");
const collaboratorController = require("./collaborator.controller");
const domainRoutes = require("./domain.routes");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();
const adminOnly = [authMiddleware, authorizeRoles("ADMIN")];
const authenticated = [authMiddleware];

router.use(domainRoutes);

router.get("/search", ...authenticated, collaboratorController.search);
router.get("/", ...adminOnly, collaboratorController.list);
router.get("/:id", ...authenticated, collaboratorController.getById);
router.post("/", ...authenticated, collaboratorController.create);
router.put("/:id", ...adminOnly, collaboratorController.update);
router.patch("/:id/status", ...adminOnly, collaboratorController.patchStatus);
router.post("/:id/blacklist", ...adminOnly, collaboratorController.addBlacklist);
router.delete("/:id/blacklist", ...adminOnly, collaboratorController.removeBlacklist);

module.exports = router;
