const express = require("express");
const helmetConfig = require("./config/helmet");
const corsConfig = require("./config/cors");
const { globalLimiter } = require("./middleware/rateLimiter");
const requestIdMiddleware = require("./middleware/requestId");
const requestLogger = require("./middleware/requestLogger");
const auditRequestInterceptor = require("./observability/audit.interceptor");
const deprecationWarning = require("./middleware/deprecationWarning");
const errorHandler = require("./middleware/errorHandler");

const authRoutes = require("./modules/auth/auth.routes");
const tenantRoutes = require("./modules/tenants/tenant.routes");
const smtpRoutes = require("./modules/smtp/smtp.routes");
const acsEmailWebhookRoutes = require("./modules/smtp/acs-email-webhook.routes");
const systemSettingsRoutes = require("./modules/system-settings/system-settings.routes");
const teamsRoutes = require("./modules/teams/teams.routes");
const systemReportsRoutes = require("./modules/system-reports/system-reports.routes");
const usersRoutes = require("./modules/users/users.routes");
const companyUsersRoutes = require("./modules/company-users/company-users.routes");
const companyRoutes = require("./modules/companies/company.routes");
const collaboratorRoutes = require("./modules/collaborators/collaborator.routes");
const eventRoutes = require("./modules/events/event.routes");
const credentialsRoutes = require("./modules/credentials/credentials.routes");
const gateRoutes = require("./modules/gate/gate.routes");
const vehicleRoutes = require("./modules/patrimonial/vehicle.routes");
const serviceAccessRoutes = require("./modules/patrimonial/service-access.routes");
const reportsRoutes = require("./modules/reports/reports.routes");
const materialsRoutes = require("./modules/materials/materials.routes");
const storageRoutes = require("./modules/storage/storage.routes");
const healthRoutes = require("./modules/health/health.routes");
const approvalsRoutes = require("./modules/approvals/approvals.routes");
const profilesRoutes = require("./modules/profiles/profiles.routes");
const sectorsRoutes = require("./modules/sectors/sectors.routes");
const alertsRoutes = require("./modules/alerts/alerts.routes");

const app = express();

// Nginx/aaPanel envia X-Forwarded-For; necessário para rate-limit e IP real do cliente
app.set("trust proxy", 1);

app.use(helmetConfig);
app.use(corsConfig);
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      if (req.originalUrl && req.originalUrl.includes("/webhooks/")) {
        req.rawBody = buf;
      }
    },
  }),
);
app.use(requestIdMiddleware);
app.use(requestLogger);
app.use(auditRequestInterceptor);
app.use(globalLimiter);

app.get("/", (req, res) => {
  res.json({
    message: "API Credenciamento - Online",
    version: "v1",
    requestId: req.requestId,
  });
});

const v1Router = express.Router();
v1Router.use("/auth", authRoutes);
v1Router.use("/tenants", tenantRoutes);
v1Router.use("/smtp", smtpRoutes);
v1Router.use("/webhooks", acsEmailWebhookRoutes);
v1Router.use("/system-settings", systemSettingsRoutes);
v1Router.use("/teams/bot", require("./modules/teams/bot/bot.routes"));
v1Router.use("/teams", teamsRoutes);
v1Router.use("/system-reports", systemReportsRoutes);
v1Router.use("/users", usersRoutes);
v1Router.use("/company-users", companyUsersRoutes);
v1Router.use("/companies", companyRoutes);
v1Router.use("/collaborators", collaboratorRoutes);
v1Router.use("/events", eventRoutes);
v1Router.use("/credentials", credentialsRoutes);
v1Router.use("/gate", gateRoutes);
v1Router.use("/vehicles", vehicleRoutes);
v1Router.use("/patrimonial/services", serviceAccessRoutes);
v1Router.use("/reports", reportsRoutes);
v1Router.use("/materials", materialsRoutes);
v1Router.use("/storage", storageRoutes);
v1Router.use("/health", healthRoutes);
v1Router.use("/approvals", approvalsRoutes);
v1Router.use("/profiles", profilesRoutes);
v1Router.use("/sectors", sectorsRoutes);
v1Router.use("/alerts", alertsRoutes);
v1Router.use("/faces", require("./modules/faces/faces.routes"));

app.use("/api/v1", v1Router);

app.use("/api", deprecationWarning, v1Router);

app.use("/api/*", (req, res) => {
  res.status(404).json({
    error: "Rota não encontrada.",
    requestId: req.requestId,
  });
});

app.use(errorHandler);

module.exports = app;
