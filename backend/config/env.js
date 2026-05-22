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
  /** URL https aberta ao clicar na notificação do Teams (feed de atividades). */
  teamsActivityWebUrl: process.env.TEAMS_ACTIVITY_WEB_URL || process.env.MSAL_REDIRECT_URI_WEB || "",
  /** ID do app no catálogo Graph (appCatalogs/teamsApps/{id}) após publicar o pacote Teams. */
  teamsAppId: (process.env.TEAMS_APP_ID || "").trim() || null,
  /** GUID do campo "id" no manifest.json — usado para resolver o Teams App ID no catálogo. */
  teamsAppExternalId:
    (process.env.TEAMS_APP_EXTERNAL_ID || "c8f4a2b1-6d3e-4f5a-9b0c-1e2d3f4a5b6c").trim() || null,
};

requireInProduction("JWT_SECRET", env.jwtSecret);
requireInProduction("REFRESH_TOKEN_SECRET", env.refreshTokenSecret);
if (isProduction) {
  requireInProduction("ENCRYPTION_KEY", env.encryptionKey);
}

module.exports = env;
