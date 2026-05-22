const express = require("express");
const smtpController = require("./smtp.controller");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/settings",
  authMiddleware,
  authorizeRoles("ADMIN"),
  smtpController.getSettings,
);
router.put(
  "/settings",
  authMiddleware,
  authorizeRoles("ADMIN"),
  smtpController.updateSettings,
);
router.post("/test", authMiddleware, authorizeRoles("ADMIN"), smtpController.testSend);
router.get("/logs", authMiddleware, authorizeRoles("ADMIN"), smtpController.listLogs);

module.exports = router;
