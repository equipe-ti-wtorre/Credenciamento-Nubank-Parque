const app = require("./app");
const env = require("./config/env");
const { logger } = require("./config/logger");
const { startupLaunch, startupFail, startupCron } = require("./config/startupLog");
const initializeDatabase = require("./config/setupDatabase");
const { startAdUsersSyncCron } = require("./jobs/adUsersSyncCron");
const { startAuditLogsRetentionCron } = require("./jobs/auditLogsRetentionCron");

async function start() {
  try {
    await initializeDatabase();

    const approvalsService = require("./modules/approvals/approvals.service");
    const eventService = require("./modules/events/event.service");
    const serviceAccessService = require("./modules/patrimonial/service-access.service");

    approvalsService.registerEntityFinalizer("EVENTO", {
      onApproved: (conn, id) => eventService.markApproved(conn, id),
      onRejected: (conn, id) => eventService.markRejected(conn, id),
    });
    approvalsService.registerEntityFinalizer("ACESSO_SERVICO", {
      onApproved: (conn, id, ctx) => serviceAccessService.markApproved(conn, id, ctx),
      onRejected: (conn, id) => serviceAccessService.markRejected(conn, id),
    });

    if (env.adUsersSyncEnabled) {
      startAdUsersSyncCron();
      startupCron(`Sincronização AD agendada (${env.adUsersSyncCron}).`);
    }
    if (env.auditRetentionEnabled) {
      startAuditLogsRetentionCron();
      startupCron(`Retenção de audit logs agendada (${env.auditRetentionCron}).`);
    }

    app.listen(env.port, () => {
      startupLaunch(`Servidor rodando na porta ${env.port}`);
      logger.info({ port: env.port, env: env.nodeEnv }, "API Credenciamento iniciada");
    });
  } catch (err) {
    startupFail("Falha ao iniciar servidor — banco incompleto ou erro de inicialização.");
    logger.fatal({ err }, "Falha ao iniciar servidor");
    process.exit(1);
  }
}

start();
