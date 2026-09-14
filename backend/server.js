const app = require("./app");
const env = require("./config/env");
const { logger } = require("./config/logger");
const { startupLaunch, startupFail, startupCron } = require("./config/startupLog");
const initializeDatabase = require("./config/setupDatabase");
const { startAdUsersSyncCron } = require("./jobs/adUsersSyncCron");
const { startAuditLogsRetentionCron } = require("./jobs/auditLogsRetentionCron");
const { startApprovalsExpirationCron } = require("./jobs/approvalsExpirationCron");
const { startFacialJobsStaleCron } = require("./jobs/facialJobsStaleCron");
const { startEventAccreditationInviteCron } = require("./jobs/eventAccreditationInviteCron");

async function start() {
  try {
    await initializeDatabase();

    const approvalsService = require("./modules/approvals/approvals.service");
    const eventService = require("./modules/events/event.service");
    const serviceAccessService = require("./modules/patrimonial/service-access.service");
    const eventAccreditationService = require("./modules/event-accreditation/event-accreditation.service");

    approvalsService.registerEntityFinalizer("EVENTO", {
      onApproved: (conn, id, ctx) => eventService.markApproved(conn, id, ctx),
      onRejected: (conn, id) => eventService.markRejected(conn, id),
      onExpired: (conn, id) => eventService.markExpired(conn, id),
    });
    approvalsService.registerEntityFinalizer("ACESSO_SERVICO", {
      onApproved: (conn, id, ctx) => serviceAccessService.markApproved(conn, id, ctx),
      onRejected: (conn, id) => serviceAccessService.markRejected(conn, id),
      onExpired: (conn, id) => serviceAccessService.markExpired(conn, id),
    });
    approvalsService.registerEntityFinalizer("CREDENCIAMENTO_EVENTO", {
      onApproved: (conn, id, ctx) => eventAccreditationService.markApproved(conn, id, ctx),
      onRejected: (conn, id) => eventAccreditationService.markRejected(conn, id),
      onExpired: (conn, id) => eventAccreditationService.markExpired(conn, id),
    });
    approvalsService.registerEntityFinalizer("CREDENCIAMENTO_EVENTO_INTERNO", {
      onApproved: (conn, id, ctx) => eventAccreditationService.markApprovedInternal(conn, id, ctx),
      onRejected: (conn, id) => eventAccreditationService.markRejectedInternal(conn, id),
      onExpired: (conn, id) => eventAccreditationService.markRejectedInternal(conn, id),
    });

    if (env.adUsersSyncEnabled) {
      startAdUsersSyncCron();
      startupCron(`Sincronização AD agendada (${env.adUsersSyncCron}).`);
    }
    if (env.auditRetentionEnabled) {
      startAuditLogsRetentionCron();
      startupCron(`Retenção de audit logs agendada (${env.auditRetentionCron}).`);
    }
    if (env.approvalsExpirationEnabled) {
      startApprovalsExpirationCron();
      startupCron(`Expiração de aprovações agendada (${env.approvalsExpirationCron}).`);
    } else {
      const facialExpire = require("./modules/facial/facial.expire.service");
      facialExpire.revokeFacialForExpiredAccesses().catch((err) => {
        logger.error({ err }, "Falha ao revogar facial de acessos expirados no startup");
      });
    }

    startFacialJobsStaleCron();
    startupCron("Requeue de jobs facial stale a cada 5 min.");

    if (env.eventAccreditationInviteEnabled) {
      startEventAccreditationInviteCron();
      startupCron(`Convites de credenciamento agendados (${env.eventAccreditationInviteCron}).`);
    }

    app.listen(env.port, env.host, () => {
      startupLaunch(`Servidor rodando em ${env.host}:${env.port}`);
      logger.info({ host: env.host, port: env.port, env: env.nodeEnv }, "API Credenciamento iniciada");
    });
  } catch (err) {
    startupFail("Falha ao iniciar servidor — banco incompleto ou erro de inicialização.");
    logger.fatal({ err }, "Falha ao iniciar servidor");
    process.exit(1);
  }
}

start();
