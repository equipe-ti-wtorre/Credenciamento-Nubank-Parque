const helmet = require("helmet");
const env = require("./env");

module.exports = helmet({
  contentSecurityPolicy: env.isProduction
    ? {
        useDefaults: true,
        directives: {
          "img-src": ["'self'", "data:", "blob:", "https:"],
        },
      }
    : false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: env.isProduction
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
});
