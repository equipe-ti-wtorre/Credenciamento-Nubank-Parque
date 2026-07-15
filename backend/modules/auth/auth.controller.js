const AppError = require("../../utils/AppError");
const { logAudit, markAuditLogged } = require("../../utils/auditLogger");
const { AUDIT_MODULES, AUDIT_ACTIONS } = require("../../observability/audit.constants");
const { buildAuditMetadata, buildHttpContext } = require("../../observability/audit.metadata");
const { setAuditLoginContext } = require("../../observability/audit.auth");
const authService = require("./auth.service");
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
