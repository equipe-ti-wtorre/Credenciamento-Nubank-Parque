const express = require("express");
const profilesController = require("./profiles.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();

router.get(
  "/modules",
  authMiddleware,
  authorizePermission("profiles", "view"),
  profilesController.getModules,
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
  authorizePermission("profiles", "view"),
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
  authorizePermission("profiles", "edit"),
  profilesController.update,
);
router.delete(
  "/:id",
  authMiddleware,
  authorizePermission("profiles", "delete"),
  profilesController.remove,
);

module.exports = router;
