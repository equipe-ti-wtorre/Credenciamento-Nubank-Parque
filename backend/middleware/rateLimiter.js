const rateLimit = require("express-rate-limit");

const limiterOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
};

const globalLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Muitas requisições. Tente novamente mais tarde." },
});

const authLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  message: { message: "Muitas tentativas de login. Tente novamente mais tarde." },
});

const microsoftAuthLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 15 * 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  message: {
    message: "Muitas tentativas de login Microsoft. Aguarde alguns minutos.",
  },
});

module.exports = { globalLimiter, authLimiter, microsoftAuthLimiter };
