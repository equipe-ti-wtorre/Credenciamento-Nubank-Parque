const express = require("express");
const reportsController = require("./reports.controller");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/dashboard",
  authMiddleware,
  authorizeRoles("ADMIN", "PRODUTORA", "PADRAO"),
  reportsController.dashboard,
);

router.get(
  "/denials",
  authMiddleware,
  authorizeRoles("ADMIN"),
  reportsController.denials,
);

module.exports = router;
