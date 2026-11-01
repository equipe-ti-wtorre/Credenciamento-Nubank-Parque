#!/usr/bin/env node
/**
 * Remove eventos, empresas, colaboradores, aprovações e acessos.
 * Preserva todas as contas, sessões, configurações e o catálogo de mercadorias.
 *
 * Uso:
 *   npm run purge-domain-data -- --dry-run
 *   npm run purge-domain-data -- --force
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const env = require("../config/env");
const { logger } = require("../config/logger");
const {
  parseResetArgs,
  assertSafeToReset,
  createAdminConnection,
} = require("./db-reset-shared");

const TABLES_PURGE = [
  "event_day_company_collaborator_denied",
  "event_day_company_collaborator",
  "event_day_company_vehicle",
  "event_day_company",
  "event_company_notify",
  "usuario_evento_preferencias",
  "event_day",
  "event",
  "event_accreditation_invite_file",
  "event_accreditation_invite",
  "event_accreditation_notify_log",
  "event_accreditation_collaborator",
  "event_accreditation_day",
  "event_accreditation_setor",
  "event_accreditation_bracelet",
  "event_accreditation_company",
  "event_accreditation",
  "event_accreditation_internal_notify_user",
  "event_accreditation_internal",
  "event_accreditation_internal_bracelet",
  "aprovacao_decisoes",
  "aprovacoes",
  "alertas",
  "service_access_collaborator",
  "service_access_vehicle",
  "service_access_date",
  "service_access",
  "gate_access_day_log",
  "facial_access_log",
  "material_movement_photo",
  "material_movement_item",
  "material_movement_collaborator",
  "material_movement",
  "external_company",
  "company_self_register_tokens",
  "user_invite_tokens",
  "company_collaborator",
  "company_contact",
  "collaborator_block_list",
  "vehicle_block_list",
  "facial_enrollment_jobs",
  "facial_enrollment_log",
  "vehicle",
  "collaborator",
  "company",
];

const TABLES_KEEP_CHECK = [
  "usuarios",
  "refresh_tokens",
  "product",
  "storage_location",
  "system_settings",
  "perfis",
  "setores",
  "facial_devices",
  "email_templates",
];

const STORAGE_ROOT = path.resolve(__dirname, "../storage");
const STORAGE_DIRS = [
  "pictures",
  "company-logos",
  "event-covers",
  "event-accreditation-covers",
  "event-accreditation-invite-files",
  "merchandise",
];

function storageDir(name) {
  const dir = path.resolve(STORAGE_ROOT, name);
  if (dir !== STORAGE_ROOT && !dir.startsWith(`${STORAGE_ROOT}${path.sep}`)) {
    throw new Error(`Diretório de storage inválido: ${name}`);
  }
  return dir;
}

function countFiles(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (stat.isFile()) return 1;
  if (!stat.isDirectory()) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === ".gitkeep") continue;
    total += countFiles(path.join(target, entry.name));
  }
  return total;
}

function inspectStorage() {
  return STORAGE_DIRS.map((name) => {
    const dir = storageDir(name);
    return {
      dir: name,
      exists: fs.existsSync(dir),
      files: countFiles(dir),
    };
  });
}

function clearStorage() {
  const results = [];
  for (const name of STORAGE_DIRS) {
    const dir = storageDir(name);
    if (!fs.existsSync(dir)) {
      results.push({ dir: name, removedFiles: 0, missing: true, errors: [] });
      continue;
    }
    let removedFiles = 0;
    const errors = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".gitkeep") continue;
      const full = path.join(dir, entry.name);
      try {
        removedFiles += countFiles(full);
        fs.rmSync(full, { recursive: true, force: true });
      } catch (err) {
        errors.push({
          path: full,
          code: err.code || "ERR",
          message: err.message,
        });
      }
    }
    results.push({ dir: name, removedFiles, missing: false, errors });
  }
  return results;
}

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [env.db.name, table],
  );
  return rows.length > 0;
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [env.db.name, table, column],
  );
  return rows.length > 0;
}

async function countRows(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total FROM \`${table}\``,
  );
  return Number(rows[0].total);
}

async function snapshot(connection, tables) {
  const counts = {};
  for (const table of tables) {
    if (!(await tableExists(connection, table))) {
      counts[table] = null;
      continue;
    }
    counts[table] = await countRows(connection, table);
  }
  return counts;
}

async function purge(connection) {
  const truncated = [];
  const skipped = [];
  const postProcess = [];

  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const table of TABLES_PURGE) {
      if (!(await tableExists(connection, table))) {
        skipped.push(table);
        continue;
      }
      await connection.query(`TRUNCATE TABLE \`${table}\``);
      truncated.push(table);
    }

    if (
      (await tableExists(connection, "usuarios")) &&
      (await columnExists(connection, "usuarios", "id_company"))
    ) {
      await connection.query("UPDATE usuarios SET id_company = NULL");
      postProcess.push("UPDATE usuarios SET id_company = NULL");
    }

    if (await tableExists(connection, "material_stock_balance")) {
      await connection.query("UPDATE material_stock_balance SET balance = 0");
      postProcess.push("UPDATE material_stock_balance SET balance = 0");
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }

  return { truncated, skipped, postProcess };
}

async function linkedCompanies(connection) {
  if (
    !(await tableExists(connection, "usuarios")) ||
    !(await columnExists(connection, "usuarios", "id_company"))
  ) {
    return null;
  }
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS total FROM usuarios WHERE id_company IS NOT NULL",
  );
  return Number(rows[0].total);
}

async function main() {
  const args = parseResetArgs();
  assertSafeToReset(args);

  const connection = await createAdminConnection({ database: env.db.name });
  let storageFailed = false;
  try {
    const [dbRows] = await connection.query("SELECT DATABASE() AS db_name");
    const database = dbRows[0].db_name;
    const before = {
      purge: await snapshot(connection, TABLES_PURGE),
      keep: await snapshot(connection, TABLES_KEEP_CHECK),
      usuariosComEmpresa: await linkedCompanies(connection),
    };
    const storageBefore = inspectStorage();

    if (args.dryRun) {
      console.log(
        JSON.stringify(
          {
            mode: "purge-domain",
            dryRun: true,
            host: env.db.host,
            database,
            truncate: TABLES_PURGE,
            postProcess: [
              "UPDATE usuarios SET id_company = NULL",
              "UPDATE material_stock_balance SET balance = 0",
            ],
            storageDirs: STORAGE_DIRS,
            before,
            storageBefore,
          },
          null,
          2,
        ),
      );
      return;
    }

    const { truncated, skipped, postProcess } = await purge(connection);
    const storage = clearStorage();
    const storageErrors = storage.flatMap((item) => item.errors || []);
    const after = {
      purge: await snapshot(connection, truncated),
      keep: await snapshot(connection, TABLES_KEEP_CHECK),
      usuariosComEmpresa: await linkedCompanies(connection),
    };

    const summary = {
      ok: storageErrors.length === 0,
      mode: "purge-domain",
      database,
      truncated,
      skipped,
      postProcess,
      before,
      after,
      storage,
    };
    logger.info(
      { database, truncated: truncated.length, skipped },
      "Limpeza de dados operacionais finalizada",
    );
    console.log(JSON.stringify(summary, null, 2));
    storageFailed = storageErrors.length > 0;
  } finally {
    await connection.end();
  }
  if (storageFailed) process.exit(1);
}

main().catch((err) => {
  logger.fatal({ err }, "Falha na limpeza de dados operacionais");
  console.error(err);
  process.exit(1);
});
