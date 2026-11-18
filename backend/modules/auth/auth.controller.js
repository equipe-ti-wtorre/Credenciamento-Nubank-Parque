const AppError = require("../../utils/AppError");
const { logAudit, markAuditLogged } = require("../../utils/auditLogger");
const { AUDIT_MODULES, AUDIT_ACTIONS } = require("../../observability/audit.constants");
const { buildAuditMetadata, buildHttpContext } = require("../../observability/audit.metadata");
const { setAuditLoginContext } = require("../../observability/audit.auth");
const authService = require("./auth.service");
const gatewayService = require("./gateway.service");
const env = require("../../config/env");
const {
  loginSchema,
  refreshSchema,
  logoutSchema,
} = require("./auth.schema");
const {
  refreshAccessToken,
  revokeRefreshToken,
} = require("./token.service");

exports.login = async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await authService.loginLocal(value.username, value.password, req);
    await logAudit({
      userId: result.user.id,
      action: AUDIT_ACTIONS.LOGIN,
      module: AUDIT_MODULES.AUTH,
      req,
      metadata: buildAuditMetadata({
        event: "auth.login",
        outcome: "success",
        provider: "local",
        resource: { type: "user", id: result.user.id, email: result.user.email },
        http: buildHttpContext(req, { statusCode: 200 }),
      }),
    });
    markAuditLogged(req);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.loginMicrosoft = async (req, res, next) => {
  try {
    if (!req.azureUser) {
      setAuditLoginContext(req, { provider: "microsoft" });
      throw new AppError("Token inválido.", 401);
    }
    const result = await authService.loginMicrosoft(req.azureUser, req);
    await logAudit({
      userId: result.user.id,
      action: AUDIT_ACTIONS.LOGIN_MICROSOFT,
      module: AUDIT_MODULES.AUTH,
      req,
      metadata: buildAuditMetadata({
        event: "auth.login_microsoft",
        outcome: "success",
        provider: "microsoft",
        resource: { type: "user", id: result.user.id, email: result.user.email },
        http: buildHttpContext(req, { statusCode: 200 }),
      }),
    });
    markAuditLogged(req);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.gatewayConfig = (req, res) => {
  res.json(gatewayService.publicConfig());
};

exports.gatewaySession = async (req, res, next) => {
  try {
    setAuditLoginContext(req, { provider: "gateway" });
    if (!env.authGateway.enabled) {
      throw new AppError("Login centralizado desativado.", 404, true, null, "GATEWAY_DISABLED");
    }
    const token = gatewayService.readGatewayCookie(req);
    if (!token) {
      throw new AppError("Faça login para continuar.", 401, true, null, "UNAUTHENTICATED");
    }
    let payload;
    try {
      payload = await gatewayService.verifyGatewayToken(token);
    } catch (err) {
      const { logger } = require("../../config/logger");
      logger.warn({ err: err?.message }, "Falha ao validar o token do gateway");
      throw new AppError("Sua sessão expirou. Entre novamente.", 401, true, null, "SESSION_INVALID");
    }

    const result = await authService.loginGateway(payload, req);
    await logAudit({
      userId: result.user.id,
      action: AUDIT_ACTIONS.LOGIN_MICROSOFT,
      module: AUDIT_MODULES.AUTH,
      req,
      metadata: buildAuditMetadata({
        event: "auth.login_gateway",
        outcome: "success",
        provider: "gateway",
        resource: { type: "user", id: result.user.id, email: result.user.email },
        http: buildHttpContext(req, { statusCode: 200 }),
      }),
    });
    markAuditLogged(req);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const { error, value } = refreshSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { accessToken, user } = await refreshAccessToken(value.refreshToken, req);
    const fullUser = await authService.getMe(user.id);
    res.json({
      auth: true,
      accessToken,
      token: accessToken,
      user: fullUser,
    });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const { error, value } = logoutSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    if (value.refreshToken) {
      await revokeRefreshToken(value.refreshToken);
    }

    if (req.user?.id) {
      await logAudit({
        userId: req.user.id,
        action: AUDIT_ACTIONS.LOGOUT,
        module: AUDIT_MODULES.AUTH,
        req,
        metadata: buildAuditMetadata({
          event: "auth.logout",
          outcome: "success",
          resource: { type: "user", id: req.user.id },
          http: buildHttpContext(req, { statusCode: 200 }),
        }),
      });
      markAuditLogged(req);
    }

    res.json({ auth: false, message: "Logout realizado." });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

exports.profilePhoto = async (req, res, next) => {
  try {
    const { buffer, contentType } = await authService.getProfilePhoto(req.user.id);
    res.set("Cache-Control", "private, max-age=3600");
    res.type(contentType);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

exports.userPhoto = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new AppError("Usuário inválido.", 400);
    }
    const { buffer, contentType } = await authService.getProfilePhoto(id);
    res.set("Cache-Control", "private, max-age=3600");
    res.type(contentType);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

exports.getInvite = async (req, res, next) => {
  try {
    const inviteService = require("./invite.service");
    const invite = await inviteService.getInviteInfo(req.params.token);
    res.json({ invite });
  } catch (err) {
    next(err);
  }
};

exports.getCompanyRegister = async (req, res, next) => {
  try {
    const selfRegisterService = require("../companies/company-self-register.service");
    const invite = await selfRegisterService.getSelfRegisterInfo(req.params.token);
    res.json({ invite });
  } catch (err) {
    next(err);
  }
};

exports.completeCompanyRegister = async (req, res, next) => {
  try {
    const { companyRegisterCompleteSchema } = require("./auth.schema");
    const selfRegisterService = require("../companies/company-self-register.service");
    const { error, value } = companyRegisterCompleteSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await selfRegisterService.completeSelfRegister(
      req.params.token,
      value,
      req,
      req.file || null,
    );

    await logAudit({
      userId: result.user.id,
      action: AUDIT_ACTIONS.LOGIN,
      module: AUDIT_MODULES.AUTH,
      req,
      metadata: buildAuditMetadata({
        event: "auth.company_self_register",
        outcome: "success",
        provider: "company_self_register",
        resource: {
          type: "user",
          id: result.user.id,
          email: result.user.email,
          id_company: result.user.id_company,
        },
        http: buildHttpContext(req, { statusCode: 200 }),
      }),
    });
    markAuditLogged(req);

    res.status(201).json(result);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(new AppError("CNPJ ou e-mail já cadastrado.", 409));
    }
    next(err);
  }
};

exports.completeInvite = async (req, res, next) => {
  try {
    const { inviteCompleteSchema } = require("./auth.schema");
    const inviteService = require("./invite.service");
    const { error, value } = inviteCompleteSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await inviteService.completeInvite(
      req.params.token,
      value.password,
      req,
    );

    await logAudit({
      userId: result.user.id,
      action: AUDIT_ACTIONS.LOGIN,
      module: AUDIT_MODULES.AUTH,
      req,
      metadata: buildAuditMetadata({
        event: "auth.invite_complete",
        outcome: "success",
        provider: "invite",
        resource: { type: "user", id: result.user.id, email: result.user.email },
        http: buildHttpContext(req, { statusCode: 200 }),
      }),
    });
    markAuditLogged(req);

    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { forgotPasswordSchema } = require("./auth.schema");
    const passwordResetService = require("./password-reset.service");
    const { error, value } = forgotPasswordSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const result = await passwordResetService.requestReset(value.email, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getPasswordReset = async (req, res, next) => {
  try {
    const passwordResetService = require("./password-reset.service");
    const reset = await passwordResetService.getResetInfo(req.params.token);
    res.json({ reset });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { resetPasswordSchema } = require("./auth.schema");
    const passwordResetService = require("./password-reset.service");
    const { error, value } = resetPasswordSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await passwordResetService.completeReset(value.token, value.password, req);
    await logAudit({
      userId: result.user.id,
      action: AUDIT_ACTIONS.LOGIN,
      module: AUDIT_MODULES.AUTH,
      req,
      metadata: buildAuditMetadata({
        event: "auth.password_reset",
        outcome: "success",
        provider: "password_reset",
        resource: { type: "user", id: result.user.id, email: result.user.email },
        http: buildHttpContext(req, { statusCode: 200 }),
      }),
    });
    markAuditLogged(req);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
