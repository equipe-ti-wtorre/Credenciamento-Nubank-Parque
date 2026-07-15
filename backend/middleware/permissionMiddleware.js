const { hasPermission, hasAnyPermission } = require("../utils/permissions");

function authorizePermission(modulo, acao) {
  return (req, res, next) => {
    if (!hasPermission(req.user, modulo, acao)) {
      return res.status(403).json({
        message: "Permissão insuficiente.",
        requestId: req.requestId,
      });
    }
    next();
  };
}

function authorizeAnyPermission(entries) {
  return (req, res, next) => {
    if (!hasAnyPermission(req.user, entries)) {
      return res.status(403).json({
        message: "Permissão insuficiente.",
        requestId: req.requestId,
      });
    }
    next();
  };
}

module.exports = { authorizePermission, authorizeAnyPermission };
