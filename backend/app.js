const express = require("express");
const helmetConfig = require("./config/helmet");
const corsConfig = require("./config/cors");
const { globalLimiter } = require("./middleware/rateLimiter");
const requestIdMiddleware = require("./middleware/requestId");
const requestLogger = require("./middleware/requestLogger");
const deprecationWarning = require("./middleware/deprecationWarning");
const errorHandler = require("./middleware/errorHandler");

const authRoutes = require("./modules/auth/auth.routes");
const tenantRoutes = require("./modules/tenants/tenant.routes");
const healthRoutes = require("./modules/health/health.routes");

const app = express();

// Nginx/aaPanel envia X-Forwarded-For; necessário para rate-limit e IP real do cliente
app.set("trust proxy", 1);

app.use(helmetConfig);
app.use(corsConfig);
app.use(express.json({ limit: "10mb" }));
app.use(requestIdMiddleware);
app.use(requestLogger);
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
