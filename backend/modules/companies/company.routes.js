const express = require("express");
const companyController = require("./company.controller");
const typesRoutes = require("./types.routes");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoEmpresa } = require("../../middleware/vinculos");
const { logoUploadMiddleware } = require("../../middleware/upload.middleware");

const router = express.Router();
const auth = authMiddleware;
const canView = [auth, authorizePermission("companies", "view")];
const canCreate = [auth, authorizePermission("companies", "create")];
const canEdit = [auth, authorizePermission("companies", "edit")];
const companyId = resolverPublicId({ param: "id", table: "company", pk: "id_company" });
const viewCompany = autorizar({ modulo: "companies", acao: "view", vinculo: vinculoEmpresa });
const editCompany = autorizar({ modulo: "companies", acao: "edit", vinculo: vinculoEmpresa });

router.use(typesRoutes);

router.get("/", auth, companyController.list);
router.post("/invite-self-register", ...canCreate, companyController.inviteSelfRegister);
router.get("/:id", auth, companyId, viewCompany, companyController.getById);
router.post("/", ...canCreate, companyController.create);
router.put("/:id", auth, companyId, editCompany, companyController.update);
router.patch("/:id/status", auth, companyId, editCompany, companyController.patchStatus);
router.post("/:id/invite-access", auth, companyId, editCompany, companyController.inviteAccess);
router.post("/:id/logo", auth, companyId, editCompany, logoUploadMiddleware, companyController.uploadLogo);

module.exports = router;
