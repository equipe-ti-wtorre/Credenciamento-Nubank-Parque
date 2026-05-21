const env = require("../config/env");
const { verifyAccessToken } = require("../modules/auth/token.service");
const AppError = require("../utils/AppError");

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Token de autenticação não fornecido.",
      requestId: req.requestId,
    });
  }

  const token = authHeader.split(" ")[1];
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({
      message: "Token inválido ou expirado.",
      requestId: req.requestId,
    });
  }
}

function authorizeRoles(...roles) {
  const allowed = roles.map((r) => String(r).toUpperCase());
  return (req, res, next) => {
    if (!req.user?.role) {
      return res.status(403).json({
        message: "Acesso negado.",
        requestId: req.requestId,
      });
    }
    const userRole = String(req.user.role).toUpperCase();
    if (!allowed.includes(userRole)) {
      return res.status(403).json({
        message: "Permissão insuficiente.",
        requestId: req.requestId,
      });
    }
    next();
  };
}

module.exports = { authMiddleware, authorizeRoles };
