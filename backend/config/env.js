require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

function requireInProduction(name, value) {
  if (isProduction && (!value || value.length < 8)) {
    throw new Error(`Variável ${name} é obrigatória em produção.`);
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction,
  port: Number(process.env.PORT) || 3007,
  apiVersion: process.env.API_VERSION || "v1",
  jwtSecret: process.env.JWT_SECRET || (isProduction ? null : "dev_jwt_secret_change_me"),
  refreshTokenSecret:
    process.env.REFRESH_TOKEN_SECRET ||
    (isProduction ? null : "dev_refresh_secret_change_me"),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || "30m",
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
  encryptionKey: process.env.ENCRYPTION_KEY,
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:4207,http://127.0.0.1:4207")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  logLevel: process.env.LOG_LEVEL || "info",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    name: process.env.DB_NAME || "credenciamento",
    poolLimit: Number(process.env.DB_POOL_LIMIT) || 10,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 30000,
  },
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  msalRedirectUriWeb: process.env.MSAL_REDIRECT_URI_WEB || "",
  msalRedirectUriAndroid: process.env.MSAL_REDIRECT_URI_ANDROID || "",
  msalRedirectUriIos: process.env.MSAL_REDIRECT_URI_IOS || "",
};

requireInProduction("JWT_SECRET", env.jwtSecret);
requireInProduction("REFRESH_TOKEN_SECRET", env.refreshTokenSecret);
if (isProduction) {
  requireInProduction("ENCRYPTION_KEY", env.encryptionKey);
}

module.exports = env;
