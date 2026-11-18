const { hasPermission, hasAnyPermission } = require("../utils/permissions");

/**
 * Perfil (módulo/ação) e, quando informado, vínculo com o registro.
 * Sem permissão de perfil → 403. O vínculo reusa os asserts dos services
 * (que respondem 403 ou 404 conforme a regra já existente).
 */
function autorizar({ modulo, acao, any, vinculo } = {}) {
  return async function autorizarMiddleware(req, res, next) {
    try {
      let allowed = false;
      if (req.user?.is_super_admin) allowed = true;
      else if (Array.isArray(any) && any.length) allowed = hasAnyPermission(req.user, any);
      else if (modulo && acao) allowed = hasPermission(req.user, modulo, acao);
      else allowed = true;

      if (!allowed) {
        return res.status(403).json({
          message: "Permissão insuficiente.",
          requestId: req.requestId,
        });
      }

      if (typeof vinculo === "function") await vinculo(req);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { autorizar };
