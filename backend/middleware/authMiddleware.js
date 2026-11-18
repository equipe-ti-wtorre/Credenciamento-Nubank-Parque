const jwt = require("jsonwebtoken");
const { verifyAccessToken } = require("../modules/auth/token.service");
const AppError = require("../utils/AppError");
const { assertUserCanAccess, DEPARTMENT_REQUIRED_MESSAGE } = require("../utils/userDepartment");
const profilesService = require("../modules/profiles/profiles.service");
const gatewayService = require("../modules/auth/gateway.service");
const env = require("../config/env");

function deny(res, req, status, code, message) {
  return res.status(status).json({ message, code, requestId: req.requestId });
}

function readBearer(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

/**
 * Quem está chamando:
 * - usuário interno: cookie nbp_session do auth-gateway (ou Bearer com o JWT do gateway, para scripts),
 *   validado localmente (RS256, iss, aud, sessões encerradas);
 * - empresa terceira, conta admin local e aba do Teams: Bearer com o JWT local (HS256).
 */
async function resolveCaller(req) {
  const bearer = readBearer(req);
  const bearerIsGateway = bearer && jwt.decode(bearer, { complete: true })?.header?.alg === "RS256";

  if (bearer && !bearerIsGateway) {
    const decoded = verifyAccessToken(bearer);
    // Tokens trocados pelo cookie do gateway (fluxo antigo) não valem mais: o navegador usa o cookie.
    if (decoded.gw_sid) throw new AppError("Sua sessão foi encerrada. Entre novamente.", 401);
    return { userId: decoded.id, via: "local" };
  }

  const gatewayToken = bearer || (env.authGateway.enabled ? gatewayService.readGatewayCookie(req) : null);
  if (!gatewayToken) return null;
  let payload;
  try {
    payload = await gatewayService.verifyGatewayToken(gatewayToken);
  } catch {
    throw new AppError("Sua sessão expirou. Entre novamente.", 401, true, null, "SESSION_INVALID");
  }
  const authService = require("../modules/auth/auth.service");
  const user = await authService.resolveGatewayUser(payload, req);
  return { userId: user.id, via: "gateway" };
}

async function authMiddleware(req, res, next) {
  try {
    const caller = await resolveCaller(req);
    if (!caller) {
      return deny(res, req, 401, "UNAUTHENTICATED", "Faça login para continuar.");
    }

    const ctx = await profilesService.loadUserProfileContext(caller.userId);
    if (!ctx || !ctx.ativo) {
      return deny(res, req, 403, "FORBIDDEN", "Usuário inativo ou não encontrado.");
    }
    // 1º acesso entra sem perfil: o administrador do sistema libera.
    if (!ctx.id_perfil && !(ctx.permissions || []).length) {
      return deny(
        res,
        req,
        403,
        "AWAITING_ACCESS",
        "Seu acesso está aguardando liberação do administrador do Credenciamento.",
      );
    }

    assertUserCanAccess(ctx);

    req.user = {
      id: ctx.id,
      role: ctx.codigo,
      perfil: ctx.codigo,
      id_perfil: ctx.id_perfil,
      id_company: ctx.id_company,
      company_type: ctx.company_type || null,
      is_super_admin: ctx.is_super_admin,
      requires_company: ctx.requires_company,
      is_ad_user: !!ctx.is_ad_user,
      auth_via: caller.via,
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
      return deny(res, req, err.statusCode, err.code || (err.statusCode === 401 ? "SESSION_INVALID" : "FORBIDDEN"), err.message);
    }
    return deny(res, req, 401, "SESSION_INVALID", "Token inválido ou expirado.");
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
