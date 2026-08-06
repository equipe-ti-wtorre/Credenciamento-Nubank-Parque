const helmet = require("helmet");
const env = require("./env");

module.exports = helmet({
  contentSecurityPolicy: env.isProduction ? undefined : false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: env.isProduction
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
});
