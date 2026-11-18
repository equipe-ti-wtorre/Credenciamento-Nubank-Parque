const express = require("express");
const authController = require("./auth.controller");
const validateMicrosoftToken = require("../../middleware/validateMicrosoftToken");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoUsuario } = require("../../middleware/vinculos");
const {
  authLimiter,
  microsoftAuthLimiter,
  passwordResetLimiter,
} = require("../../middleware/rateLimiter");
const { optionalLogoUploadMiddleware } = require("../../middleware/upload.middleware");

const router = express.Router();

router.post("/login", authLimiter, authController.login);
router.post(
  "/login-microsoft",
  microsoftAuthLimiter,
  validateMicrosoftToken,
  authController.loginMicrosoft,
);
router.get("/gateway/config", authController.gatewayConfig);
router.post("/gateway/session", microsoftAuthLimiter, authController.gatewaySession);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post("/forgot-password", passwordResetLimiter, authController.forgotPassword);
router.get("/reset-password/:token", passwordResetLimiter, authController.getPasswordReset);
router.post("/reset-password", passwordResetLimiter, authController.resetPassword);
router.get("/invite/:token", authLimiter, authController.getInvite);
router.post("/invite/:token/complete", authLimiter, authController.completeInvite);
router.get("/company-register/:token", authLimiter, authController.getCompanyRegister);
router.post(
  "/company-register/:token",
  authLimiter,
  optionalLogoUploadMiddleware,
  authController.completeCompanyRegister,
);
router.get("/me", authMiddleware, authController.me);
router.get("/profile-photo", authMiddleware, authController.profilePhoto);
router.get("/users/:id/photo", authMiddleware, resolverPublicId({ param: "id", table: "usuarios", pk: "id" }), autorizar({ vinculo: vinculoUsuario }), authController.userPhoto);

module.exports = router;
