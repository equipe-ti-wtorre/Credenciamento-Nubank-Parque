const express = require("express");
const profilesController = require("./profiles.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const {
  authorizePermission,
  authorizeAnyPermission,
} = require("../../middleware/permissionMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");

const router = express.Router();
const profileId = resolverPublicId({ param: "id", table: "perfis", pk: "id" });

router.get(
  "/modules",
  authMiddleware,
  authorizePermission("profiles", "view"),
  profilesController.getModules,
);
router.get(
  "/lookup",
  authMiddleware,
  authorizeAnyPermission([
    { modulo: "profiles", acao: "edit" },
    { modulo: "profiles", acao: "create" },
  ]),
  profilesController.lookup,
);
router.get(
  "/",
  authMiddleware,
  authorizePermission("profiles", "view"),
  profilesController.list,
);
router.get(
  "/:id",
  authMiddleware,
  profileId,
  autorizar({ modulo: "profiles", acao: "view" }),
  profilesController.getById,
);
router.post(
  "/",
  authMiddleware,
  authorizePermission("profiles", "create"),
  profilesController.create,
);
router.patch(
  "/:id",
  authMiddleware,
  profileId,
  autorizar({ modulo: "profiles", acao: "edit" }),
  profilesController.update,
);
router.delete(
  "/:id",
  authMiddleware,
  profileId,
  autorizar({ modulo: "profiles", acao: "delete" }),
  profilesController.remove,
);

module.exports = router;
