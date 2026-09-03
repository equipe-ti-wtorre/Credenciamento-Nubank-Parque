"use strict";

const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { child } = require("../../config/logger");
const facialGatewayConfig = require("./facial-gateway-config.service");
const jobsService = require("./facial.jobs.service");
const facialCommand = require("./facial.command.service");
const serviceBusClient = require("./service-bus.client");
const enrollmentService = require("./facial.enrollment.service");

const logger = child({ module: "facial-sync" });

const STALE_QUEUE_WARN_MS = 5 * 60 * 1000;

let forceSyncInProgress = false;

function ageMs(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? Date.now() - t : null;
}

function formatAge(ms) {
  if (ms == null) return null;
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} h`;
}

async function countEligibleCollaborators() {
  const [[row]] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM collaborator c
     WHERE c.status = 1
       AND c.picture IS NOT NULL
       AND TRIM(c.picture) <> ''
       AND NOT EXISTS (
         SELECT 1 FROM collaborator_block_list b
         WHERE b.id_collaborator = c.id_collaborator
       )`,
  );
  return Number(row?.total) || 0;
}

async function listEligibleCollaborators() {
  const [rows] = await db.execute(
    `SELECT c.id_collaborator, c.name, c.picture, c.facial_status
     FROM collaborator c
     WHERE c.status = 1
       AND c.picture IS NOT NULL
       AND TRIM(c.picture) <> ''
       AND NOT EXISTS (
         SELECT 1 FROM collaborator_block_list b
         WHERE b.id_collaborator = c.id_collaborator
       )
     ORDER BY c.id_collaborator ASC`,
  );
  return rows;
}

async function testSync() {
  const config = await facialGatewayConfig.getPublicConfig();
  const jobs = await jobsService.getQueueStats();
  const eligibleCount = await countEligibleCollaborators();
  const checks = [];

  checks.push({
    key: "enabled",
    ok: !!config.enabled,
    label: config.enabled ? "Integração facial ativa" : "Integração facial inativa",
  });

  checks.push({
    key: "secret",
    ok: !!config.has_events_secret,
    label: config.has_events_secret
      ? "Secret Bearer configurado (.env)"
      : "Secret Bearer ausente no .env",
  });

  const transport = config.transport || "http_poll";
  checks.push({
    key: "transport",
    ok: true,
    label:
      transport === "service_bus"
        ? "Transporte: Azure Service Bus"
        : "Transporte: HTTP",
  });

  if (transport === "service_bus") {
    const probe = await serviceBusClient.probeConnection();
    checks.push({
      key: "service_bus",
      ok: !!probe.ok,
      label: probe.ok
        ? "Conexão Service Bus (comandos) ok"
        : `Service Bus indisponível: ${probe.reason || "falha"}`,
    });
  } else {
    const oldestAge = ageMs(jobs.oldestQueuedAt);
    const lastClaimAge = ageMs(jobs.lastClaimedAt);
    const queueStale =
      jobs.queued > 0 && oldestAge != null && oldestAge > STALE_QUEUE_WARN_MS;
    const neverClaimed = jobs.queued > 0 && !jobs.lastClaimedAt;
    const warning = queueStale || neverClaimed;
    let label = `Fila HTTP: ${jobs.queued} queued, ${jobs.processing} em processamento`;
    if (neverClaimed) {
      label += " — nenhum claim do Gateway ainda";
    } else if (queueStale) {
      label += ` — job mais antigo há ${formatAge(oldestAge)}`;
    } else if (jobs.lastClaimedAt) {
      label += ` — último claim há ${formatAge(lastClaimAge)}`;
    }
    checks.push({
      key: "queue",
      ok: true,
      warning,
      label,
    });
  }

  checks.push({
    key: "eligible",
    ok: true,
    label:
      eligibleCount === 1
        ? "1 colaborador elegível para enroll"
        : `${eligibleCount} colaboradores elegíveis para enroll`,
  });

  const failed = checks.filter((c) => c.ok === false);
  const warnings = checks.filter((c) => c.ok && c.warning);
  const ok = failed.length === 0;
  const overallStatus = !ok ? "failed" : warnings.length ? "warning" : "ok";
  const error = failed.map((c) => c.label).join("; ") || null;

  const result = {
    ok,
    enabled: !!config.enabled,
    configComplete: !!(
      config.has_events_secret &&
      (transport !== "service_bus" ||
        (config.has_commands_connection_string && config.has_status_connection_string))
    ),
    transport,
    eligibleCount,
    jobs,
    checks,
    warningCount: warnings.length,
    errorCount: failed.length,
  };

  logger.info(
    {
      ok,
      overallStatus,
      transport,
      eligibleCount,
      warningCount: warnings.length,
      errorCount: failed.length,
      queued: jobs.queued,
      processing: jobs.processing,
      checks: checks.map((c) => ({
        key: c.key,
        ok: c.ok,
        warning: !!c.warning,
        label: c.label,
      })),
    },
    "Teste de sync facial",
  );

  await enrollmentService.logEnrollmentPayload({
    idCollaborator: null,
    correlationId: null,
    direction: "outbound",
    payload: {
      type: "sync_test",
      command: "sync-test",
      overallStatus,
      error,
      ok,
      transport,
      eligibleCount,
      jobs,
      checks,
      warningCount: warnings.length,
      errorCount: failed.length,
    },
  });

  return result;
}

async function forceSync() {
  if (forceSyncInProgress) {
    return { ok: false, alreadyRunning: true, message: "Sincronização já em execução." };
  }

  const runtime = await facialGatewayConfig.getRuntimeConfig();
  if (!runtime.enabled) {
    throw new AppError("Ative a integração facial antes de forçar o sync.", 400);
  }
  if (!runtime.eventsSecret) {
    throw new AppError(
      "Configure FACIAL_GATEWAY_EVENTS_SECRET no .env antes de forçar o sync.",
      400,
    );
  }

  forceSyncInProgress = true;
  const startedAt = new Date();
  const errors = [];
  let queued = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const collaborators = await listEligibleCollaborators();
    for (const row of collaborators) {
      try {
        const result = await facialCommand.sendEnroll(row, null);
        if (result.skipped) {
          skipped += 1;
        } else if (result.sent) {
          sent += 1;
        } else {
          queued += 1;
        }
      } catch (err) {
        failed += 1;
        if (errors.length < 20) {
          errors.push({
            id_collaborator: row.id_collaborator,
            name: row.name,
            error: err.message || "Falha ao enfileirar enroll",
          });
        }
        logger.warn(
          { err, idCollaborator: row.id_collaborator },
          "Falha ao forçar enroll facial",
        );
      }
    }

    logger.info(
      {
        eligible: collaborators.length,
        queued,
        sent,
        skipped,
        failed,
        durationMs: Date.now() - startedAt.getTime(),
      },
      "Force sync facial concluído",
    );

    return {
      ok: failed === 0,
      alreadyRunning: false,
      eligible: collaborators.length,
      queued,
      sent,
      skipped,
      failed,
      errors,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
    };
  } finally {
    forceSyncInProgress = false;
  }
}

module.exports = {
  testSync,
  forceSync,
};
