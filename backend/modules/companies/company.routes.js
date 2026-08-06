const express = require("express");
const companyController = require("./company.controller");
const typesRoutes = require("./types.routes");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { logoUploadMiddleware } = require("../../middleware/upload.middleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("companies", "view")];
const canCreate = [auth, authorizePermission("companies", "create")];
const canEdit = [auth, authorizePermission("companies", "edit")];

router.use(typesRoutes);

router.get("/", auth, companyController.list);
router.get("/:id", auth, companyController.getById);
router.post("/", ...canCreate, companyController.create);
router.put("/:id", ...canEdit, companyController.update);
router.patch("/:id/status", ...canEdit, companyController.patchStatus);
router.post("/:id/invite-access", ...canEdit, companyController.inviteAccess);
router.post("/:id/logo", ...canEdit, logoUploadMiddleware, companyController.uploadLogo);

module.exports = router;
