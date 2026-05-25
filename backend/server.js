const app = require("./app");
const env = require("./config/env");
const { logger } = require("./config/logger");
const initializeDatabase = require("./config/setupDatabase");
const { startAdUsersSyncCron } = require("./jobs/adUsersSyncCron");
const { startAuditLogsRetentionCron } = require("./jobs/auditLogsRetentionCron");

async function start() {
  try {
    await initializeDatabase();
    startAdUsersSyncCron();
    startAuditLogsRetentionCron();
    app.listen(env.port, () => {
      logger.info({ port: env.port, env: env.nodeEnv }, "API Credenciamento iniciada");
    });
  } catch (err) {
    logger.fatal({ err }, "Falha ao iniciar servidor");
    process.exit(1);
  }
}

start();
