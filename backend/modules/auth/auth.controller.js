const AppError = require("../../utils/AppError");
const { logAudit } = require("../../utils/auditLogger");
const { child } = require("../../config/logger");
const authService = require("./auth.service");
const { loginSchema, refreshSchema, logoutSchema } = require("./auth.schema");
const {
  refreshAccessToken,
  revokeRefreshToken,
} = require("./token.service");

const logger = child({ module: "auth" });

exports.login = async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const result = await authService.loginLocal(value.username, value.password, req);
    await logAudit({
      userId: result.user.id,
      action: "LOGIN",
      module: "auth",
      req,
    });
    res.json(result);
  } catch (err) {
    logger.error({ err, requestId: req.requestId }, "Falha no login");
    next(err);
  }
};

exports.loginMicrosoft = async (req, res, next) => {
  try {
    if (!req.azureUser) throw new AppError("Token inválido.", 401);
    const result = await authService.loginMicrosoft(req.azureUser, req);
    await logAudit({
      userId: result.user.id,
      action: "LOGIN_MICROSOFT",
      module: "auth",
      req,
    });
    res.json(result);
  } catch (err) {
    logger.error({ err, requestId: req.requestId }, "Falha no login Microsoft");
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
        action: "LOGOUT",
        module: "auth",
        req,
      });
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
