const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const env = require("./env");
const { logger } = require("./logger");
const { startupOk, startupStep, startupFail, startupWarn } = require("./startupLog");
const migrations = require("./migrationManifest");

const MIGRATIONS_DIR = path.join(__dirname, "../migrations");

function isMigrationStrict() {
  return env.isProduction || String(process.env.MIGRATION_STRICT || "false").toLowerCase() === "true";
}

function isReferenceSql(content) {
  const header = content.split("\n").slice(0, 3).join("\n");
  return /refer[eê]ncia/i.test(header);
}

function parseSqlStatements(content) {
  return content
    .split(";")
    .map((s) => s.trim())
    .map((s) =>
      s
        .split("\n")
        .filter((line) => {
          const t = line.trim();
          return t.length > 0 && !t.startsWith("--");
        })
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);
}

function fileChecksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function ensureSchemaMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_schema_migrations_filename (filename)
    )
  `);
}

async function getAppliedMigration(connection, filename) {
  const [rows] = await connection.query(
    "SELECT filename, checksum FROM schema_migrations WHERE filename = ? LIMIT 1",
    [filename],
  );
  return rows[0] || null;
}

async function registerMigration(connection, filename, checksum) {
  await connection.query(
    `INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE checksum = VALUES(checksum), applied_at = CURRENT_TIMESTAMP`,
    [filename, checksum],
  );
}

async function executeMigrationFile(connection, entry, content) {
  if (entry.referenceOnly || isReferenceSql(content)) {
    return "baseline";
  }

  const statements = parseSqlStatements(content);
  for (const statement of statements) {
    await connection.query(statement);
  }
  return "applied";
}

async function applyPendingMigrations(connection) {
  await ensureSchemaMigrationsTable(connection);
  startupStep(`Validando migrations pendentes (${migrations.length} arquivos)...`);

  for (const entry of migrations) {
    const sqlPath = path.join(MIGRATIONS_DIR, entry.filename);
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Arquivo de migration não encontrado: ${entry.filename}`);
    }

    const content = fs.readFileSync(sqlPath, "utf8");
    const checksum = fileChecksum(content);
    const applied = await getAppliedMigration(connection, entry.filename);
    const isValid = await entry.validate(connection);

    if (applied && isValid) {
      continue;
    }

    if (isValid && !applied) {
      await registerMigration(connection, entry.filename, checksum);
      startupOk(`${entry.filename} — baseline (já satisfeito).`);
      logger.info({ filename: entry.filename }, "Migration runner: baseline registrado");
      continue;
    }

    if (entry.referenceOnly || isReferenceSql(content)) {
      const msg = `${entry.filename} — schema esperado ausente (referência)`;
      startupFail(msg);
      logger.error({ filename: entry.filename }, "Migration de referência não satisfeita");
      throw new Error(`Migration pendente: ${entry.filename}`);
    }

    const result = await executeMigrationFile(connection, entry, content);
    await registerMigration(connection, entry.filename, checksum);

    if (result === "applied") {
      startupOk(`${entry.filename} aplicado.`);
      logger.info({ filename: entry.filename }, "Migration runner: SQL aplicado");
    } else {
      startupOk(`${entry.filename} — baseline (já satisfeito).`);
      logger.info({ filename: entry.filename }, "Migration runner: baseline registrado");
    }
  }
}

async function assertAllMigrationsApplied(connection) {
  const pending = [];

  for (const entry of migrations) {
    const isValid = await entry.validate(connection);
    if (!isValid) {
      pending.push(entry.filename);
    }
  }

  const total = migrations.length;
  const ok = total - pending.length;

  if (pending.length === 0) {
    startupOk(`Migrations: ${total}/${total} validadas com sucesso.`);
    logger.info({ total }, "Migration runner: todas validadas");
    return { total, ok: total, pending: [] };
  }

  const summary = pending.join(", ");
  startupFail(`Migrations pendentes: ${summary}`);
  logger.error({ pending, ok, total }, "Migration runner: validação falhou");

  if (isMigrationStrict()) {
    throw new Error(`Migrations pendentes (${pending.length}/${total}): ${summary}`);
  }

  startupWarn(`Modo permissivo: servidor continuará (${ok}/${total} validadas).`);
  return { total, ok, pending };
}

module.exports = {
  applyPendingMigrations,
  assertAllMigrationsApplied,
  migrations,
};
