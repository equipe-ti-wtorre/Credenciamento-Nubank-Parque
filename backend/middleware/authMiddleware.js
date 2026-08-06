const db = require("../config/db");
const { verifyAccessToken } = require("../modules/auth/token.service");
const AppError = require("../utils/AppError");
const { assertUserCanAccess, DEPARTMENT_REQUIRED_MESSAGE } = require("../utils/userDepartment");
const profilesService = require("../modules/profiles/profiles.service");

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Token de autenticação não fornecido.",
      requestId: req.requestId,
    });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = verifyAccessToken(token);
    const ctx = await profilesService.loadUserProfileContext(decoded.id);
    if (!ctx || !ctx.ativo) {
      return res.status(403).json({
        message: "Usuário inativo ou não encontrado.",
        requestId: req.requestId,
      });
    }

    assertUserCanAccess(ctx);

    req.user = {
      id: ctx.id,
      role: ctx.codigo,
      perfil: ctx.codigo,
      id_perfil: ctx.id_perfil,
      id_company: ctx.id_company,
      is_super_admin: ctx.is_super_admin,
      requires_company: ctx.requires_company,
      profile: {
        id: ctx.id_perfil,
        codigo: ctx.codigo,
        nome: ctx.perfil_nome,
      },
      permissions: ctx.permissions,
    };
    next();
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        message: err.message,
        requestId: req.requestId,
      });
    }
    return res.status(401).json({
      message: "Token inválido ou expirado.",
      requestId: req.requestId,
    });
  }
}

function authorizeRoles(...roles) {
  const allowed = roles.map((r) => String(r).toUpperCase());
  return (req, res, next) => {
    if (req.user?.is_super_admin) return next();
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

module.exports = { authMiddleware, authorizeRoles, DEPARTMENT_REQUIRED_MESSAGE };
