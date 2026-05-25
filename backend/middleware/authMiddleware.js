const db = require("../config/db");
const { verifyAccessToken } = require("../modules/auth/token.service");
const AppError = require("../utils/AppError");
const { assertUserCanAccess, DEPARTMENT_REQUIRED_MESSAGE } = require("../utils/userDepartment");

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
    req.user = verifyAccessToken(token);

    const [rows] = await db.execute(
      "SELECT id, ativo, departamento, perfil, id_company FROM usuarios WHERE id = ? LIMIT 1",
      [req.user.id],
    );
    const row = rows[0];
    if (!row || !row.ativo) {
      return res.status(403).json({
        message: "Usuário inativo ou não encontrado.",
        requestId: req.requestId,
      });
    }

    assertUserCanAccess(row);
    req.user.role = row.perfil || req.user.role;
    req.user.perfil = row.perfil;
    req.user.id_company = row.id_company != null ? row.id_company : null;
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
