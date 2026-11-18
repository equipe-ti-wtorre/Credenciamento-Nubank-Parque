"use strict";

const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { child } = require("../../config/logger");
const jobsService = require("./facial.jobs.service");
const facialCommand = require("./facial.command.service");
const devicesService = require("./facial.devices.service");
const enrollmentService = require("./facial.enrollment.service");
const { STATUS_APROVADO } = require("../credentials/credentials.schema");
const { existsActiveBlockSql } = require("../collaborator-blocklist/blocklist.policy");

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

const RELEASED_TODAY_SQL = `
  AND (
    EXISTS (
      SELECT 1
        FROM service_access_collaborator sac
        INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
       WHERE (sac.id_collaborator = c.id_collaborator OR sac.id_substitute = c.id_collaborator)
         AND sa.status = 1
         AND sa.id_access_status = ${STATUS_APROVADO}
         AND DATE(sac.facial_released_at) = CURDATE()
    )
    OR EXISTS (
      SELECT 1
        FROM event_day_company_collaborator edcc
        INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
        INNER JOIN event_day ed ON ed.id_event_day = edc.id_event_day
        INNER JOIN event e ON e.id_event = ed.id_event
       WHERE (edcc.id_collaborator = c.id_collaborator OR edcc.id_substitute = c.id_collaborator)
         AND edcc.id_access_status = ${STATUS_APROVADO}
         AND e.ativo = 1
         AND DATE(edcc.facial_released_at) = CURDATE()
    )
  )
`;

async function countEligibleCollaborators() {
  const [[row]] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM collaborator c
     WHERE c.status = 1
       AND c.picture IS NOT NULL
       AND TRIM(c.picture) <> ''
       AND NOT ${existsActiveBlockSql("c.id_collaborator")}
       ${RELEASED_TODAY_SQL}`,
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
       AND NOT ${existsActiveBlockSql("c.id_collaborator")}
       ${RELEASED_TODAY_SQL}
     ORDER BY c.id_collaborator ASC`,
  );
  return rows;
}

async function testSync() {
  const jobs = await jobsService.getQueueStats();
  const eligibleCount = await countEligibleCollaborators();
  const directDevices = await devicesService.countEnabled();
  const checks = [];

  checks.push({
    key: "devices",
    ok: directDevices > 0,
    label:
      directDevices > 0
        ? `${directDevices} terminal(is) Dahua ativo(s)`
        : "Nenhum terminal Dahua ativo",
  });

  checks.push({
    key: "transport",
    ok: directDevices > 0,
    label:
      directDevices > 0
        ? "Transporte: direto nos terminais Dahua"
        : "Transporte direto indisponível sem terminal ativo",
  });

  const oldestAge = ageMs(jobs.oldestQueuedAt);
  const queueStale = jobs.queued > 0 && oldestAge != null && oldestAge > STALE_QUEUE_WARN_MS;
  checks.push({
    key: "queue",
    ok: true,
    warning: queueStale,
    label: queueStale
      ? `Fila local: ${jobs.queued} aguardando há ${formatAge(oldestAge)}`
      : `Fila local: ${jobs.queued} aguardando, ${jobs.processing} em processamento`,
  });

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
    enabled: directDevices > 0,
    configComplete: directDevices > 0,
    transport: "direct_dahua",
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
      transport: "direct_dahua",
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
      transport: "direct_dahua",
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

  if (!(await devicesService.hasEnabled())) {
    throw new AppError("Cadastre um terminal Dahua ativo antes de forçar o sync.", 400);
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
