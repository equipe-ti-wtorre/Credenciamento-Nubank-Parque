const express = require("express");
const reportsController = require("./reports.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();

router.get(
  "/dashboard",
  authMiddleware,
  authorizePermission("dashboard", "view"),
  reportsController.dashboard,
);

router.get(
  "/denials",
  authMiddleware,
  authorizePermission("credential_denials", "view"),
  reportsController.denials,
);

module.exports = router;
