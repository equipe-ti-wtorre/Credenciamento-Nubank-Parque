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
router.get("/invite/:token", authLimiter, authController.getInvite);
router.post("/invite/:token/complete", authLimiter, authController.completeInvite);
router.get("/me", authMiddleware, authController.me);
router.get("/profile-photo", authMiddleware, authController.profilePhoto);
router.get("/users/:id/photo", authMiddleware, authController.userPhoto);

module.exports = router;
