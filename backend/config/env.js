const path = require("path");

const envFilePath = path.join(__dirname, "../.env");
const dotenvResult = require("dotenv").config({ path: envFilePath });
if (dotenvResult.parsed) {
  for (const [key, value] of Object.entries(dotenvResult.parsed)) {
    if (!String(process.env[key] ?? "").trim() && String(value ?? "").trim()) {
      process.env[key] = value;
    }
  }
}

const { parseIpList } = require("../utils/facialPeerIps");

const isProduction = process.env.NODE_ENV === "production";

const JWT_PLACEHOLDERS = ["change-me", "change-me-credenciamento-jwt"];
const FACIAL_SECRET_PLACEHOLDERS = ["change-me-events-secret", "segredo-forte"];

function requireInProduction(name, value) {
  if (isProduction && (!value || value.length < 8)) {
    throw new Error(`Variável ${name} é obrigatória em produção.`);
  }
}

function requireFacialEventsSecret(raw) {
  const secret = String(raw || "").trim();
  if (!secret) {
    throw new Error("FACIAL_GATEWAY_EVENTS_SECRET é obrigatório (≥ 32 caracteres).");
  }
  if (secret.length < 32) {
    throw new Error("FACIAL_GATEWAY_EVENTS_SECRET deve ter no mínimo 32 caracteres.");
  }
  if (FACIAL_SECRET_PLACEHOLDERS.includes(secret)) {
    throw new Error(
      "FACIAL_GATEWAY_EVENTS_SECRET não pode ser um valor de exemplo (change-me-events-secret / segredo-forte).",
    );
  }
  return secret;
}

function requireProductionJwtSecret(raw) {
  const secret = String(raw || "").trim();
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET é obrigatório em produção (mínimo 32 caracteres).");
  }
  if (JWT_PLACEHOLDERS.includes(secret)) {
    throw new Error("JWT_SECRET em produção não pode ser change-me / change-me-credenciamento-jwt.");
  }
  return secret;
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction,
  host: (process.env.HOST || "127.0.0.1").trim() || "127.0.0.1",
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
  /** URL base do frontend (convites, links de e-mail). */
  appPublicUrl: (
    process.env.APP_PUBLIC_URL ||
    process.env.TEAMS_ACTIVITY_WEB_URL ||
    process.env.MSAL_REDIRECT_URI_WEB ||
    ""
  )
    .trim()
    .replace(/\/$/, ""),
  logLevel: process.env.LOG_LEVEL || "info",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    name: process.env.DB_NAME || "credenciamento",
    poolLimit: Number(process.env.DB_POOL_LIMIT) || 10,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 30000,
    acquireTimeout: Number(process.env.DB_ACQUIRE_TIMEOUT_MS) || 10000,
    timezone: process.env.DB_TIMEZONE || "-03:00",
  },
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  organizationName: process.env.ORGANIZATION_NAME || "Credenciamento",
  msalRedirectUriWeb: process.env.MSAL_REDIRECT_URI_WEB || "",
  msalRedirectUriAndroid: process.env.MSAL_REDIRECT_URI_ANDROID || "",
  msalRedirectUriIos: process.env.MSAL_REDIRECT_URI_IOS || "",
  /** Login centralizado (auth-gateway). `url` é o issuer do JWT e a URL usada pelo navegador. */
  authGateway: (() => {
    const url = (process.env.AUTH_GATEWAY_URL || "").trim().replace(/\/+$/, "");
    return {
      enabled: process.env.AUTH_GATEWAY_ENABLED === "true" && !!url,
      url,
      jwksUrl: (process.env.AUTH_GATEWAY_JWKS_URL || "").trim() || `${url}/.well-known/jwks.json`,
      revokedUrl: (process.env.AUTH_GATEWAY_REVOKED_URL || "").trim() || `${url}/sessions/revoked`,
      cookieName: (process.env.AUTH_GATEWAY_COOKIE || "").trim() || "nbp_session",
      audience: (process.env.AUTH_GATEWAY_AUDIENCE || "").trim() || "nbp-systems",
    };
  })(),
  /** Chave da API do auth-gateway (diretório e foto); só no backend. */
  authApiKey: (process.env.AUTH_API_KEY || "").trim(),
  /** URL https aberta ao clicar na notificação do Teams (feed de atividades). */
  teamsActivityWebUrl: process.env.TEAMS_ACTIVITY_WEB_URL || process.env.MSAL_REDIRECT_URI_WEB || "",
  /** ID do app no catálogo Graph (appCatalogs/teamsApps/{id}) após publicar o pacote Teams. */
  teamsAppId: (process.env.TEAMS_APP_ID || "").trim() || null,
  /** GUID do campo "id" no manifest.json — usado para resolver o Teams App ID no catálogo. */
  teamsAppExternalId:
    (process.env.TEAMS_APP_EXTERNAL_ID || "c8f4a2b1-6d3e-4f5a-9b0c-1e2d3f4a5b6c").trim() || null,
  /** ID da integração Teams (canal) para alertas de credenciamento; se vazio, usa a primeira ativa. */
  teamsCredentialsIntegrationId: Number(process.env.TEAMS_CREDENTIALS_INTEGRATION_ID) || null,
  /** Bot Framework — opcional no .env; se vazio, usa tenant principal de azure_tenants. */
  teamsBotAppId: (process.env.TEAMS_BOT_APP_ID || process.env.TEAMS_AAD_CLIENT_ID || "").trim() || null,
  teamsBotAppPassword: (process.env.TEAMS_BOT_APP_PASSWORD || "").trim() || null,
  teamsBotAppTenantId: (process.env.TEAMS_BOT_TENANT_ID || "").trim() || null,
  /** Service URL regional do Bot Connector (ex.: https://smba.trafficmanager.net/amer/). */
  teamsBotServiceUrl: (process.env.TEAMS_BOT_SERVICE_URL || "https://smba.trafficmanager.net/amer/").trim(),
  /**
   * Action.Submit (Aprovar/Bloquear no card) exige messaging endpoint do Azure Bot.
   * Default false: usa Action.OpenUrl para o SPA (evita 502 / "Unable to reach app").
   * Só ative após configurar https://cred.nbpdev.com.br/api/v1/teams/bot/messages no Azure Bot.
   */
  teamsBotInteractive:
    String(process.env.TEAMS_BOT_INTERACTIVE || "false").toLowerCase() === "true",
  /** Secret da subscription Event Grid (webhook ACS email delivery). */
  eventGridWebhookSecret: (process.env.EVENT_GRID_WEBHOOK_SECRET || "").trim() || null,
  /** Desativa rate limit (apenas dev/teste local). */
  rateLimitDisabled:
    String(process.env.RATE_LIMIT_DISABLED || "false").toLowerCase() === "true",
  rateLimitGlobalWindowMs: Number(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS) || 15 * 60 * 1000,
  /** Por usuário autenticado (JWT); sem Bearer, por IP. Fotos/gateway não entram no contador. */
  rateLimitGlobalMax: Number(process.env.RATE_LIMIT_GLOBAL_MAX) || 2000,
  rateLimitAuthWindowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60 * 1000,
  rateLimitAuthMax: Number(process.env.RATE_LIMIT_AUTH_MAX) || 30,
  rateLimitMicrosoftAuthMax: Number(process.env.RATE_LIMIT_MICROSOFT_AUTH_MAX) || 40,
  /** POST /error-logs/client — por IP, janela curta para evitar flood. */
  rateLimitClientErrorWindowMs: Number(process.env.RATE_LIMIT_CLIENT_ERROR_WINDOW_MS) || 60 * 1000,
  rateLimitClientErrorMax: Number(process.env.RATE_LIMIT_CLIENT_ERROR_MAX) || 20,
  /** Cron: sincronizar usuários do Azure AD (true/false). */
  adUsersSyncEnabled: String(process.env.AD_USERS_SYNC_ENABLED || "true").toLowerCase() === "true",
  /** Expressão cron (padrão: a cada hora, no minuto 0). */
  adUsersSyncCron: process.env.AD_USERS_SYNC_CRON || "0 * * * *",
  /** Timezone IANA para a cron (ex.: America/Sao_Paulo). */
  adUsersSyncTimezone: process.env.AD_USERS_SYNC_TIMEZONE || "America/Sao_Paulo",
  /** Cron: arquivar audit_logs antigos (true/false). */
  auditRetentionEnabled:
    String(process.env.AUDIT_RETENTION_ENABLED || "true").toLowerCase() === "true",
  /** Expressão cron (padrão: todo dia às 03:00, após sync AD). */
  auditRetentionCron: process.env.AUDIT_RETENTION_CRON || "0 3 * * *",
  auditRetentionTimezone: process.env.AUDIT_RETENTION_TIMEZONE || "America/Sao_Paulo",
  /** Dias em hot storage para LIST/READ. */
  auditRetentionReadDays: Math.max(1, Number(process.env.AUDIT_RETENTION_READ_DAYS) || 90),
  /** Dias em hot storage para demais ações. */
  auditRetentionDefaultDays: Math.max(1, Number(process.env.AUDIT_RETENTION_DEFAULT_DAYS) || 365),
  /** Pasta de cold storage (relativa ao diretório backend/ se não absoluta). */
  auditArchiveDir: process.env.AUDIT_ARCHIVE_DIR || "./storage/audit-archive",
  auditArchiveBatchSize: Math.max(100, Number(process.env.AUDIT_ARCHIVE_BATCH_SIZE) || 2000),
  auditArchiveMaxBatches: Math.max(1, Number(process.env.AUDIT_ARCHIVE_MAX_BATCHES) || 50),
  auditArchiveDryRun:
    String(process.env.AUDIT_ARCHIVE_DRY_RUN || "false").toLowerCase() === "true",
  /** Cron: arquivar app_error_logs antigos (true/false). */
  errorRetentionEnabled:
    String(process.env.ERROR_RETENTION_ENABLED || "true").toLowerCase() === "true",
  /** Expressão cron (padrão: 03:15, após audit_logs). */
  errorRetentionCron: process.env.ERROR_RETENTION_CRON || "15 3 * * *",
  errorRetentionTimezone: process.env.ERROR_RETENTION_TIMEZONE || "America/Sao_Paulo",
  /** Dias em hot storage para warn/4xx (alto volume). */
  errorRetentionWarnDays: Math.max(1, Number(process.env.ERROR_RETENTION_WARN_DAYS) || 90),
  /** Dias em hot storage para error/5xx. */
  errorRetentionDefaultDays: Math.max(1, Number(process.env.ERROR_RETENTION_DEFAULT_DAYS) || 365),
  errorArchiveDir: process.env.ERROR_ARCHIVE_DIR || "./storage/error-archive",
  errorArchiveBatchSize: Math.max(100, Number(process.env.ERROR_ARCHIVE_BATCH_SIZE) || 2000),
  errorArchiveMaxBatches: Math.max(1, Number(process.env.ERROR_ARCHIVE_MAX_BATCHES) || 50),
  errorArchiveDryRun:
    String(process.env.ERROR_ARCHIVE_DRY_RUN || "false").toLowerCase() === "true",
  /** Cron: finalizar aprovações pendentes com período já encerrado. */
  approvalsExpirationEnabled:
    String(process.env.APPROVALS_EXPIRATION_ENABLED || "true").toLowerCase() === "true",
  /** Expressão cron (padrão: todo dia às 00:15). */
  approvalsExpirationCron: process.env.APPROVALS_EXPIRATION_CRON || "15 0 * * *",
  approvalsExpirationTimezone:
    process.env.APPROVALS_EXPIRATION_TIMEZONE || "America/Sao_Paulo",
  /** Cron: disparar convites de credenciamento agendados. */
  eventAccreditationInviteEnabled:
    String(process.env.EVENT_ACCREDITATION_INVITE_ENABLED || "true").toLowerCase() === "true",
  eventAccreditationInviteCron: process.env.EVENT_ACCREDITATION_INVITE_CRON || "*/15 * * * *",
  eventAccreditationInviteTimezone:
    process.env.EVENT_ACCREDITATION_INVITE_TIMEZONE || "America/Sao_Paulo",
  /** Tolerância em horas para acesso fora da meia-noite (montagem/desmontagem). */
  gateAccessToleranceHours: Math.max(0, Number(process.env.GATE_ACCESS_TOLERANCE_HOURS) || 6),
  /** CNPJs próprios (destinatário do DANFE), sem máscara, separados por vírgula. */
  ownCnpjs: new Set(
    String(process.env.OWN_CNPJS || "")
      .split(",")
      .map((s) => s.replace(/\D/g, ""))
      .filter(Boolean),
  ),
  /** Job BrasilAPI para external_company. Default false — não chama HTTP no request. */
  externalCompanyEnrichEnabled:
    String(process.env.EXTERNAL_COMPANY_ENRICH || "false").toLowerCase() === "true",

  /**
   * Validador facial (Control iD + Dahua) — limiares a calibrar com fotos reais do balcão.
   * Não gera embedding/reconhecimento; só qualidade + viabilidade de variante.
   */
  faces: {
    centerMaxOffsetRatio: Number(process.env.FACES_CENTER_MAX_OFFSET_RATIO) || 0.15,
    marginMinRatio: Number(process.env.FACES_MARGIN_MIN_RATIO) || 0.05,
    widthMinRatio: Number(process.env.FACES_WIDTH_MIN_RATIO) || 0.25,
    /** Fotos de crachá/ID costumam preencher ~60–70% da largura. */
    widthMaxRatio: Number(process.env.FACES_WIDTH_MAX_RATIO) || 0.75,
    poseMaxYawDeg: Number(process.env.FACES_POSE_MAX_YAW_DEG) || 20,
    poseMaxPitchDeg: Number(process.env.FACES_POSE_MAX_PITCH_DEG) || 20,
    poseMaxRollDeg: Number(process.env.FACES_POSE_MAX_ROLL_DEG) || 15,
    poseMarginDeg: Number(process.env.FACES_POSE_MARGIN_DEG) || 5,
    /** Divergência máxima roll PnP vs linha dos olhos para manter confiante. */
    poseRollSanityMaxDeg: Number(process.env.FACES_POSE_ROLL_SANITY_MAX_DEG) || 12,
    earMin: Number(process.env.FACES_EAR_MIN) || 0.22,
    /** Variância do Laplaciano — a calibrar. */
    laplacianMin: Number(process.env.FACES_LAPLACIAN_MIN) || 80,
    lumaMin: Number(process.env.FACES_LUMA_MIN) || 60,
    lumaMax: Number(process.env.FACES_LUMA_MAX) || 200,
    satHighRatioMax: Number(process.env.FACES_SAT_HIGH_RATIO_MAX) || 0.15,
    satLowRatioMax: Number(process.env.FACES_SAT_LOW_RATIO_MAX) || 0.15,
    opencvInitTimeoutMs: Number(process.env.FACES_OPENCV_INIT_TIMEOUT_MS) || 15000,
    dahua: {
      minShort: Number(process.env.FACES_DAHUA_MIN_SHORT) || 150,
      minLong: Number(process.env.FACES_DAHUA_MIN_LONG) || 300,
      maxShort: Number(process.env.FACES_DAHUA_MAX_SHORT) || 600,
      maxLong: Number(process.env.FACES_DAHUA_MAX_LONG) || 1200,
      minSide: Number(process.env.FACES_DAHUA_MIN_SIDE) || 500,
      /** Abaixo de minShort/minLong = bloqueio; entre soft e minSide = aviso. */
      minSideSoft: Number(process.env.FACES_DAHUA_MIN_SIDE_SOFT) || 360,
      maxBytes: Number(process.env.FACES_DAHUA_MAX_BYTES) || 102400,
    },
    controlid: {
      maxBytes: Number(process.env.FACES_CONTROLID_MAX_BYTES) || 1048576,
    },
    modelsPath: process.env.FACES_MODELS_PATH || "./models/face-api",
  },

  /** Jobs HTTP poll em `processing` voltam para `queued` após este timeout. */
  facialJobStaleMinutes: Math.max(1, Number(process.env.FACIAL_JOB_STALE_MINUTES) || 30),
  /** Horas extras após o fim do acesso antes de apagar a face nos terminais. */
  facialRevokeGraceHours: Math.max(0, Number(process.env.FACIAL_REVOKE_GRACE_HOURS) || 4),
  /** Bearer compartilhado com o Gateway (HTTP poll). Obrigatório em dev e prod. */
  facialGatewayEventsSecret: requireFacialEventsSecret(process.env.FACIAL_GATEWAY_EVENTS_SECRET),
  /** IP(s) públicos de saída do Gateway (allowlist). Em produção é obrigatório. */
  facialPeerOriginIpRaw: (process.env.FACIAL_PEER_ORIGIN_IP || "").trim(),
  /** IP(s) públicos do Credenciamento (paridade com o Gateway). Em produção é obrigatório. */
  facialPeerDestinationIpRaw: (process.env.FACIAL_PEER_DESTINATION_IP || "").trim(),
};

env.facialPeerOriginIps = parseIpList(env.facialPeerOriginIpRaw);
env.facialPeerDestinationIps = parseIpList(env.facialPeerDestinationIpRaw);

if (isProduction) {
  env.jwtSecret = requireProductionJwtSecret(env.jwtSecret);
  if (!env.facialPeerOriginIps.length) {
    throw new Error("FACIAL_PEER_ORIGIN_IP é obrigatório em produção.");
  }
  if (!env.facialPeerDestinationIps.length) {
    throw new Error("FACIAL_PEER_DESTINATION_IP é obrigatório em produção.");
  }
}

requireInProduction("REFRESH_TOKEN_SECRET", env.refreshTokenSecret);
if (isProduction) {
  requireInProduction("ENCRYPTION_KEY", env.encryptionKey);
}

module.exports = env;
