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
const systemSettingsRoutes = require("./modules/system-settings/system-settings.routes");
const teamsRoutes = require("./modules/teams/teams.routes");
const systemReportsRoutes = require("./modules/system-reports/system-reports.routes");
const usersRoutes = require("./modules/users/users.routes");
const companyRoutes = require("./modules/companies/company.routes");
const collaboratorRoutes = require("./modules/collaborators/collaborator.routes");
const eventRoutes = require("./modules/events/event.routes");
const credentialsRoutes = require("./modules/credentials/credentials.routes");
const gateRoutes = require("./modules/gate/gate.routes");
const vehicleRoutes = require("./modules/patrimonial/vehicle.routes");
const serviceAccessRoutes = require("./modules/patrimonial/service-access.routes");
const reportsRoutes = require("./modules/reports/reports.routes");
const storageRoutes = require("./modules/storage/storage.routes");
const healthRoutes = require("./modules/health/health.routes");

const app = express();

// Nginx/aaPanel envia X-Forwarded-For; necessário para rate-limit e IP real do cliente
app.set("trust proxy", 1);

app.use(helmetConfig);
app.use(corsConfig);
app.use(express.json({ limit: "10mb" }));
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
v1Router.use("/system-settings", systemSettingsRoutes);
v1Router.use("/teams", teamsRoutes);
v1Router.use("/system-reports", systemReportsRoutes);
v1Router.use("/users", usersRoutes);
v1Router.use("/companies", companyRoutes);
v1Router.use("/collaborators", collaboratorRoutes);
v1Router.use("/events", eventRoutes);
v1Router.use("/credentials", credentialsRoutes);
v1Router.use("/gate", gateRoutes);
v1Router.use("/vehicles", vehicleRoutes);
v1Router.use("/patrimonial/services", serviceAccessRoutes);
v1Router.use("/reports", reportsRoutes);
v1Router.use("/storage", storageRoutes);
v1Router.use("/health", healthRoutes);

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
