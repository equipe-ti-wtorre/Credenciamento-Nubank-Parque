"use strict";

const crypto = require("crypto");
const AppError = require("../utils/AppError");
const { child } = require("../config/logger");
const env = require("../config/env");
const { isClientIpAllowed, parseIpList } = require("../utils/facialPeerIps");
const facialGatewayConfig = require("../modules/facial/facial-gateway-config.service");

const logger = child({ module: "facial-gateway-events" });

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1].trim() : null;
}

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "";
}

async function facialGatewayEventsMiddleware(req, res, next) {
  try {
    const runtime = await facialGatewayConfig.getRuntimeConfig();
    const fromEnv = env.facialPeerOriginIps || [];
    let originAllowlist = fromEnv;
    if (!originAllowlist.length) {
      try {
        originAllowlist = parseIpList(runtime.peerOriginIp || "");
      } catch {
        originAllowlist = [];
      }
    }
    if (originAllowlist.length > 0) {
      const ip = clientIp(req);
      if (!isClientIpAllowed(ip, originAllowlist)) {
        logger.warn({ requestId: req.requestId, ip }, "IP de origem facial recusado");
        return next(new AppError("Origem não autorizada.", 403));
      }
    }

    const secret = env.facialGatewayEventsSecret;
    if (!secret) {
      logger.warn("FACIAL_GATEWAY_EVENTS_SECRET não configurado");
      return next(new AppError("Webhook facial não configurado.", 503));
    }

    const token = extractBearerToken(req);
    if (!token) {
      return next(new AppError("Authorization Bearer ausente.", 401));
    }

    let ok = false;
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(secret);
      ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      ok = false;
    }

    if (!ok) {
      logger.warn({ requestId: req.requestId }, "Bearer facial inválido");
      return next(new AppError("Authorization Bearer inválido.", 401));
    }

    if (!runtime.enabled) {
      return next(new AppError("Integração facial desabilitada.", 503));
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  facialGatewayEventsMiddleware,
  extractBearerToken,
};
