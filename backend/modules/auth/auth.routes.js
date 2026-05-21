const express = require("express");
const authController = require("./auth.controller");
const validateMicrosoftToken = require("../../middleware/validateMicrosoftToken");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authLimiter, microsoftAuthLimiter } = require("../../middleware/rateLimiter");

const router = express.Router();

router.post("/login", authLimiter, authController.login);
router.post(
  "/login-microsoft",
  microsoftAuthLimiter,
  validateMicrosoftToken,
  authController.loginMicrosoft,
);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", authMiddleware, authController.me);

module.exports = router;
