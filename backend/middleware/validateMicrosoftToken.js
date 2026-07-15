const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const db = require("../config/db");
const { child } = require("../config/logger");
const { logAppError } = require("../utils/appErrorLogger");

const logger = child({ module: "microsoft-auth" });
const jwksCache = new Map();

function getJwksClient(tenantId) {
  if (!jwksCache.has(tenantId)) {
    jwksCache.set(
      tenantId,
      jwksClient({
        jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        cache: true,
        rateLimit: true,
      }),
    );
  }
  return jwksCache.get(tenantId);
}

function getSigningKey(tenantId, kid) {
  return new Promise((resolve, reject) => {
    getJwksClient(tenantId).getSigningKey(kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.getPublicKey());
    });
  });
}

async function rejectMicrosoftAuth(req, res, statusCode, message, metadata = null) {
  await logAppError({
    req,
    module: "microsoft-auth",
    message,
    statusCode,
    level: "warn",
    metadata,
  });
  return res.status(statusCode).json({
    message,
    requestId: req.requestId,
  });
}

async function validateMicrosoftToken(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return rejectMicrosoftAuth(req, res, 401, "Token Microsoft não fornecido.");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded?.payload) {
      return rejectMicrosoftAuth(req, res, 401, "Token inválido.");
    }

    const { tid, aud, oid, iss } = decoded.payload;
    if (!tid || !aud || !oid) {
      return rejectMicrosoftAuth(req, res, 401, "Claims obrigatórias ausentes no token.", {
        tid: !!tid,
        aud: !!aud,
        oid: !!oid,
      });
    }

    const [tenantRows] = await db.execute(
      `SELECT id, nome, azure_tenant_id, client_id FROM azure_tenants
       WHERE azure_tenant_id = ? AND ativo = 1 LIMIT 1`,
      [tid],
    );

    if (tenantRows.length === 0) {
      return rejectMicrosoftAuth(
        req,
        res,
        401,
        "Tenant Azure não cadastrado ou inativo para este login.",
        { tid, aud },
      );
    }

    const tenant = tenantRows[0];
    const [principalRows] = await db.execute(
      `SELECT client_id FROM azure_tenants WHERE ativo = 1 AND eh_principal = 1 LIMIT 1`,
    );
    const principalClientId = principalRows[0]?.client_id || null;
    const allowedAudiences = new Set([tenant.client_id, `api://${tenant.client_id}`]);
    if (principalClientId) {
      allowedAudiences.add(principalClientId);
      allowedAudiences.add(`api://${principalClientId}`);
    }
    // SSO Teams: Application ID URI no formato api://{hostname}/{clientId}
    const hostHint =
      (typeof req.get === "function" && (req.get("x-forwarded-host") || req.get("host"))) ||
      process.env.PUBLIC_HOST ||
      "cred.allianzparque.intra";
    const hostname = String(hostHint).split(":")[0].toLowerCase();
    if (hostname && tenant.client_id) {
      allowedAudiences.add(`api://${hostname}/${tenant.client_id}`);
    }
    if (hostname && principalClientId) {
      allowedAudiences.add(`api://${hostname}/${principalClientId}`);
    }

    const audOk =
      allowedAudiences.has(aud) ||
      (typeof aud === "string" &&
        [...allowedAudiences].some((a) => aud === a || aud.startsWith(`${a}/`))) ||
      (typeof aud === "string" &&
        /^api:\/\/[^/]+\/[0-9a-f-]{36}$/i.test(aud) &&
        (aud.endsWith(`/${tenant.client_id}`) ||
          (principalClientId && aud.endsWith(`/${principalClientId}`))));

    if (!audOk) {
      return rejectMicrosoftAuth(
        req,
        res,
        401,
        "Aplicação Azure (audience) não autorizada para este tenant.",
        { tid, aud, allowed: [...allowedAudiences] },
      );
    }

    const kid = decoded.header?.kid;
    if (!kid) {
      return rejectMicrosoftAuth(req, res, 401, "Token sem kid no header.");
    }

    const signingKey = await getSigningKey(tid, kid);
    const verified = jwt.verify(token, signingKey, {
      algorithms: ["RS256"],
      audience: aud,
      issuer: iss || `https://login.microsoftonline.com/${tid}/v2.0`,
    });

    req.azureUser = verified;
    req.azureTenant = tenant;
    next();
  } catch (error) {
    logger.error({ err: error, requestId: req.requestId }, "Token Microsoft inválido");
    return rejectMicrosoftAuth(req, res, 401, "Token Microsoft inválido ou expirado.", {
      error: error.message,
    });
  }
}

module.exports = validateMicrosoftToken;
