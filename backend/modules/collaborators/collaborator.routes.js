const express = require("express");
const collaboratorController = require("./collaborator.controller");
const documentChangeController = require("./document-change.controller");
const domainRoutes = require("./domain.routes");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");
const { bulkUploadMiddleware, pictureUploadMiddleware } = require("../../middleware/upload.middleware");

const router = express.Router();
const adminOnly = [authMiddleware, authorizeRoles("ADMIN")];
const authenticated = [authMiddleware];

router.use(domainRoutes);

router.get("/search", ...authenticated, collaboratorController.search);
router.get("/", ...adminOnly, collaboratorController.list);
router.post(
  "/bulk",
  ...authenticated,
  bulkUploadMiddleware,
  collaboratorController.bulkCreate,
);
router.get(
  "/document-change/pending",
  ...adminOnly,
  documentChangeController.listPending,
);
router.patch(
  "/document-change/:id/status",
  ...adminOnly,
  documentChangeController.patchStatus,
);
router.get("/:id", ...authenticated, collaboratorController.getById);
router.post("/", ...authenticated, collaboratorController.create);
router.post(
  "/:id/picture",
  ...adminOnly,
  pictureUploadMiddleware,
  collaboratorController.uploadPicture,
);
router.post(
  "/:id/document-change",
  ...authenticated,
  documentChangeController.create,
);
router.put("/:id", ...adminOnly, collaboratorController.update);
router.patch("/:id/status", ...adminOnly, collaboratorController.patchStatus);
router.post("/:id/blacklist", ...adminOnly, collaboratorController.addBlacklist);
router.delete("/:id/blacklist", ...adminOnly, collaboratorController.removeBlacklist);

module.exports = router;
