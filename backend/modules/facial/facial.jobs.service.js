"use strict";

const fs = require("fs");
const path = require("path");
const db = require("../../config/db");
const env = require("../../config/env");
const { child } = require("../../config/logger");
const {
  COMMAND_ENROLL,
  COMMAND_REVOKE,
  buildLinkedId,
  buildUserId,
  buildEnrollCommand,
  buildRevokeCommand,
  toSqlDate,
} = require("./facial.contract");

const logger = child({ module: "facial-jobs" });

const PICTURES_DIR = path.join(__dirname, "../../storage/pictures");
const CLAIM_LIMIT_MAX = 20;
const JOB_STATUSES_FROM_OVERALL = new Set(["synced", "partial", "pending", "failed"]);

function picturesDir() {
  return PICTURES_DIR;
}

function safePictureFilename(filename) {
  if (!filename) return null;
  const base = path.basename(String(filename).trim());
  if (!base || base === "." || base === "..") return null;
  return base;
}

function loadPhotoBase64(filename) {
  const safe = safePictureFilename(filename);
  if (!safe) return null;
  const full = path.join(PICTURES_DIR, safe);
  if (!full.startsWith(PICTURES_DIR)) return null;
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full).toString("base64");
}

function loadPhotoBuffer(filename) {
  const safe = safePictureFilename(filename);
  if (!safe) return null;
  const full = path.join(PICTURES_DIR, safe);
  if (!full.startsWith(PICTURES_DIR)) return null;
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full);
}

function mapJobStatusFromEnrollment(parsed) {
  const overall = String(parsed.overallStatus || "").toLowerCase();
  if (JOB_STATUSES_FROM_OVERALL.has(overall)) return overall;
  return "failed";
}

async function supersedeQueuedJobs(idCollaborator, exceptCorrelationId) {
  await db.execute(
    `UPDATE facial_enrollment_jobs
     SET status = 'failed', error = 'superseded_by_newer_job', completed_at = NOW()
     WHERE id_collaborator = ? AND status = 'queued' AND correlation_id <> ?`,
    [idCollaborator, exceptCorrelationId],
  );
}

async function enqueueJob({
  correlationId,
  idCollaborator,
  type,
  photoFilename = null,
  validDateStart = null,
  validDateEnd = null,
}) {
  await db.execute(
    `INSERT INTO facial_enrollment_jobs
       (correlation_id, id_collaborator, type, status, photo_filename,
        valid_date_start, valid_date_end)
     VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
    [
      correlationId,
      idCollaborator,
      type,
      safePictureFilename(photoFilename),
      toSqlDate(validDateStart),
      toSqlDate(validDateEnd),
    ],
  );
  await supersedeQueuedJobs(idCollaborator, correlationId);
  logger.info(
    { correlationId, idCollaborator, type },
    `Service Bus ausente — job fica queued para HTTP poll: ${type} ${correlationId}`,
  );
}

async function requeueStaleJobs() {
  const minutes = Math.max(1, Number(env.facialJobStaleMinutes) || 30);
  const [result] = await db.execute(
    `UPDATE facial_enrollment_jobs
     SET status = 'queued', claimed_at = NULL, error = 'stale_processing_requeued'
     WHERE status = 'processing'
       AND claimed_at IS NOT NULL
       AND claimed_at < DATE_SUB(NOW(), INTERVAL ${minutes} MINUTE)`,
  );
  const affected = result?.affectedRows || 0;
  if (affected > 0) {
    logger.warn({ affected, minutes }, "Jobs facial em processing recolocados na fila (timeout)");
  }
  return affected;
}

function toClaimPayload(row, photoBase64) {
  const linkedId = buildLinkedId(row.id_collaborator);
  const userId = buildUserId(row.id_collaborator);
  if (row.type === COMMAND_REVOKE) {
    return buildRevokeCommand({
      correlationId: row.correlation_id,
      linkedId,
      userId,
    });
  }
  return buildEnrollCommand({
    correlationId: row.correlation_id,
    linkedId,
    userId,
    userName: row.collaborator_name || undefined,
    photoBase64,
    cardNo: userId,
    validDateStart: toSqlDate(row.valid_date_start) || undefined,
    validDateEnd: toSqlDate(row.valid_date_end) || undefined,
  });
}

async function claimJobs(limit = 5) {
  await requeueStaleJobs();

  const safeLimit = Math.min(CLAIM_LIMIT_MAX, Math.max(1, Number(limit) || 5));
  const conn = await db.getConnection();
  const jobs = [];
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT j.id, j.correlation_id, j.id_collaborator, j.type, j.photo_filename,
              j.valid_date_start, j.valid_date_end,
              c.name AS collaborator_name, c.picture AS collaborator_picture
       FROM facial_enrollment_jobs j
       INNER JOIN collaborator c ON c.id_collaborator = j.id_collaborator
       WHERE j.status = 'queued'
       ORDER BY j.criado_em ASC, j.id ASC
       LIMIT ${safeLimit}
       FOR UPDATE SKIP LOCKED`,
    );

    if (!rows.length) {
      await conn.commit();
      return [];
    }

    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    await conn.execute(
      `UPDATE facial_enrollment_jobs
       SET status = 'processing', claimed_at = NOW(), error = NULL
       WHERE id IN (${placeholders})`,
      ids,
    );
    await conn.commit();

    for (const row of rows) {
      if (row.type === COMMAND_ENROLL) {
        const photoBase64 =
          loadPhotoBase64(row.photo_filename) || loadPhotoBase64(row.collaborator_picture);
        if (!photoBase64) {
          await db.execute(
            `UPDATE facial_enrollment_jobs
             SET status = 'failed', error = ?, completed_at = NOW()
             WHERE id = ?`,
            ["photoBase64 ausente no job de enroll", row.id],
          );
          logger.warn(
            { correlationId: row.correlation_id, idCollaborator: row.id_collaborator },
            "Job enroll sem foto — marcado failed",
          );
          continue;
        }
        jobs.push(toClaimPayload(row, photoBase64));
        continue;
      }
      jobs.push(toClaimPayload(row, null));
    }
    return jobs;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function completeJobFromStatus(parsed) {
  if (!parsed?.correlationId) return { updated: false };
  const status = mapJobStatusFromEnrollment(parsed);
  const error = parsed.error || null;
  const completed =
    status === "synced" || status === "failed" || status === "partial" ? new Date() : null;

  const [result] = await db.execute(
    `UPDATE facial_enrollment_jobs
     SET status = ?, error = ?, completed_at = COALESCE(?, completed_at)
     WHERE correlation_id = ?`,
    [status, error, completed, parsed.correlationId],
  );
  return { updated: (result?.affectedRows || 0) > 0, status };
}

async function listJobsByCollaborator(idCollaborator, { limit = 10 } = {}) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const [rows] = await db.execute(
    `SELECT id, correlation_id, type, status, claimed_at, completed_at, error, criado_em
     FROM facial_enrollment_jobs
     WHERE id_collaborator = ?
     ORDER BY criado_em DESC
     LIMIT ${safeLimit}`,
    [idCollaborator],
  );
  return rows;
}

async function listQueuedJobs(limit = 5) {
  const safeLimit = Math.min(CLAIM_LIMIT_MAX, Math.max(1, Number(limit) || 5));
  const [[countRow]] = await db.execute(
    `SELECT COUNT(*) AS total FROM facial_enrollment_jobs WHERE status = 'queued'`,
  );
  const [rows] = await db.execute(
    `SELECT j.correlation_id, j.type, j.id_collaborator, j.criado_em
     FROM facial_enrollment_jobs j
     WHERE j.status = 'queued'
     ORDER BY j.criado_em ASC, j.id ASC
     LIMIT ${safeLimit}`,
  );
  return {
    count: Number(countRow?.total) || 0,
    jobs: rows.map((row) => ({
      correlationId: row.correlation_id,
      type: row.type,
      linkedId: buildLinkedId(row.id_collaborator),
      userId: buildUserId(row.id_collaborator),
      createdAt: row.criado_em,
    })),
  };
}

async function getQueueStats() {
  const byStatus = {
    queued: 0,
    processing: 0,
    synced: 0,
    partial: 0,
    pending: 0,
    failed: 0,
  };
  const [rows] = await db.execute(
    `SELECT status, COUNT(*) AS total FROM facial_enrollment_jobs GROUP BY status`,
  );
  for (const row of rows) {
    if (byStatus[row.status] !== undefined) {
      byStatus[row.status] = Number(row.total) || 0;
    }
  }
  const [[lastClaim]] = await db.execute(
    `SELECT MAX(claimed_at) AS lastClaimedAt FROM facial_enrollment_jobs`,
  );
  const [[oldestQueued]] = await db.execute(
    `SELECT MIN(criado_em) AS oldestQueuedAt
     FROM facial_enrollment_jobs
     WHERE status = 'queued'`,
  );
  return {
    ...byStatus,
    lastClaimedAt: lastClaim?.lastClaimedAt || null,
    oldestQueuedAt: oldestQueued?.oldestQueuedAt || null,
  };
}

module.exports = {
  picturesDir,
  loadPhotoBase64,
  loadPhotoBuffer,
  enqueueJob,
  claimJobs,
  listQueuedJobs,
  requeueStaleJobs,
  completeJobFromStatus,
  listJobsByCollaborator,
  getQueueStats,
  CLAIM_LIMIT_MAX,
};
