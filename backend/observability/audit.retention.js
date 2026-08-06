const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");
const db = require("../config/db");
const env = require("../config/env");
const { child } = require("../config/logger");
const { logAudit } = require("../utils/auditLogger");
const { AUDIT_ACTIONS } = require("./audit.constants");
const { buildAuditMetadata } = require("./audit.metadata");

const gunzip = promisify(zlib.gunzip);
const gzip = promisify(zlib.gzip);

const logger = child({ module: "audit-retention" });

let retentionInProgress = false;

const READ_ACTIONS = [AUDIT_ACTIONS.LIST, AUDIT_ACTIONS.READ];

function resolveArchiveDir() {
  const dir = env.auditArchiveDir;
  if (path.isAbsolute(dir)) return dir;
  return path.resolve(__dirname, "..", dir);
}

function formatDateKey(dateValue) {
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return { yyyy, mm, dd, key: `${yyyy}-${mm}-${dd}` };
}

function jsonlPathForDate(archiveDir, dateKey) {
  return path.join(
    archiveDir,
    dateKey.yyyy,
    dateKey.mm,
    `audit-${dateKey.key}.jsonl`,
  );
}

function gzipPathForJsonl(jsonlPath) {
  return jsonlPath.replace(/\.jsonl$/, ".jsonl.gz");
}

function parseMetadata(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return { raw: String(value) };
  }
}

function rowToArchivePayload(row) {
  return {
    archived_at: new Date().toISOString(),
    id: row.id,
    user_id: row.user_id,
    action: row.action,
    module: row.module,
    ip: row.ip,
    client_type: row.client_type,
    request_id: row.request_id,
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at,
  };
}

async function appendRowsToJsonl(archiveDir, rows, touchedJsonlFiles) {
  const buffersByFile = new Map();

  for (const row of rows) {
    const dateKey = formatDateKey(row.created_at);
    const filePath = jsonlPathForDate(archiveDir, dateKey);
    const line = `${JSON.stringify(rowToArchivePayload(row))}\n`;
    if (!buffersByFile.has(filePath)) {
      buffersByFile.set(filePath, []);
    }
    buffersByFile.get(filePath).push(line);
    touchedJsonlFiles.add(filePath);
  }

  for (const [filePath, lines] of buffersByFile) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, lines.join(""), "utf8");
  }
}

async function mergeJsonlIntoGzip(jsonlPath, gzPath) {
  const jsonlContent = await fs.readFile(jsonlPath, "utf8");
  let combined = jsonlContent;

  try {
    const existing = await fs.readFile(gzPath);
    const decompressed = await gunzip(existing);
    combined = decompressed.toString("utf8") + jsonlContent;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  const compressed = await gzip(Buffer.from(combined, "utf8"));
  await fs.writeFile(gzPath, compressed);
  await fs.unlink(jsonlPath);
}

async function finalizeGzipArchives(touchedJsonlFiles) {
  const files = [...touchedJsonlFiles];
  for (const jsonlPath of files) {
    const gzPath = gzipPathForJsonl(jsonlPath);
    await mergeJsonlIntoGzip(jsonlPath, gzPath);
  }
}

async function processPass({
  archiveDir,
  readActions,
  retentionDays,
  dryRun,
  batchSize,
  maxBatches,
  touchedJsonlFiles,
}) {
  let archived = 0;
  let deleted = 0;
  let batches = 0;

  const actionClause = readActions
    ? `action IN (${READ_ACTIONS.map(() => "?").join(", ")})`
    : `action NOT IN (${READ_ACTIONS.map(() => "?").join(", ")})`;

  while (batches < maxBatches) {
    const [rows] = await db.execute(
      `SELECT id, user_id, action, module, ip, client_type, request_id, metadata, created_at
       FROM audit_logs
       WHERE ${actionClause}
         AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY id ASC
       LIMIT ?`,
      [...READ_ACTIONS, retentionDays, batchSize],
    );

    if (rows.length === 0) break;

    batches += 1;
    const ids = rows.map((r) => r.id);

    await appendRowsToJsonl(archiveDir, rows, touchedJsonlFiles);
    archived += rows.length;

    if (!dryRun) {
      const placeholders = ids.map(() => "?").join(", ");
      const [result] = await db.execute(
        `DELETE FROM audit_logs WHERE id IN (${placeholders})`,
        ids,
      );
      deleted += result.affectedRows ?? rows.length;
    }
  }

  return { archived, deleted, batches };
}

async function logRetentionSummary(result, triggeredBy) {
  await logAudit({
    userId: null,
    action: AUDIT_ACTIONS.SYNC,
    module: "observability",
    req: null,
    metadata: buildAuditMetadata({
      event: "observability.audit_retention",
      outcome: result.ok ? "success" : "failure",
      extra: {
        job: "audit-retention",
        triggeredBy,
        ...result,
      },
    }),
  });
}

async function runAuditLogsRetention({ triggeredBy = "manual" } = {}) {
  if (retentionInProgress) {
    logger.warn({ triggeredBy }, "Arquivamento de audit_logs já em execução");
    return {
      ok: false,
      message: "Arquivamento já em execução.",
      alreadyRunning: true,
    };
  }

  retentionInProgress = true;
  const startedAt = Date.now();
  const archiveDir = resolveArchiveDir();
  const dryRun = env.auditArchiveDryRun;
  const touchedJsonlFiles = new Set();

  try {
    await fs.mkdir(archiveDir, { recursive: true });

    const readResult = await processPass({
      archiveDir,
      readActions: true,
      retentionDays: env.auditRetentionReadDays,
      dryRun,
      batchSize: env.auditArchiveBatchSize,
      maxBatches: env.auditArchiveMaxBatches,
      touchedJsonlFiles,
    });

    const defaultResult = await processPass({
      archiveDir,
      readActions: false,
      retentionDays: env.auditRetentionDefaultDays,
      dryRun,
      batchSize: env.auditArchiveBatchSize,
      maxBatches: env.auditArchiveMaxBatches,
      touchedJsonlFiles,
    });

    if (!dryRun && touchedJsonlFiles.size > 0) {
      await finalizeGzipArchives(touchedJsonlFiles);
    }

    const gzipFiles = dryRun
      ? []
      : [...touchedJsonlFiles].map((p) => gzipPathForJsonl(p));

    const result = {
      ok: true,
      triggeredBy,
      dryRun,
      readArchived: readResult.archived,
      readDeleted: readResult.deleted,
      defaultArchived: defaultResult.archived,
      defaultDeleted: defaultResult.deleted,
      readBatches: readResult.batches,
      defaultBatches: defaultResult.batches,
      retentionReadDays: env.auditRetentionReadDays,
      retentionDefaultDays: env.auditRetentionDefaultDays,
      archiveDir,
      files: gzipFiles,
      durationMs: Date.now() - startedAt,
    };

    logger.info(result, "Arquivamento audit_logs concluído");

    if (!dryRun && (readResult.archived > 0 || defaultResult.archived > 0)) {
      await logRetentionSummary(result, triggeredBy);
    }

    return result;
  } catch (err) {
    logger.error({ err, triggeredBy }, "Falha no arquivamento audit_logs");
    return {
      ok: false,
      triggeredBy,
      message: err.message || "Falha no arquivamento.",
      durationMs: Date.now() - startedAt,
    };
  } finally {
    retentionInProgress = false;
  }
}

module.exports = { runAuditLogsRetention, resolveArchiveDir };
