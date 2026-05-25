#!/usr/bin/env node
/**
 * Zera dados operacionais e logs; preserva tenants, SMTP, Teams, usuários e lookups.
 * Uso: npm run reset-database-data -- --force
 */
require("dotenv").config();

const env = require("../config/env");
const { logger } = require("../config/logger");
const initializeDatabase = require("../config/setupDatabase");
const {
  TABLES_PRESERVE,
  TABLES_TRUNCATE,
  parseResetArgs,
  assertSafeToReset,
  createAdminConnection,
} = require("./db-reset-shared");

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [env.db.name, table],
  );
  return rows.length > 0;
}

async function truncateOperationalData(connection) {
  const truncated = [];
  const skipped = [];

  await connection.beginTransaction();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");

    for (const table of TABLES_TRUNCATE) {
      if (!(await tableExists(connection, table))) {
        skipped.push(table);
        continue;
      }
      await connection.query(`TRUNCATE TABLE \`${table}\``);
      truncated.push(table);
    }

    if (await tableExists(connection, "usuarios")) {
      await connection.query("UPDATE usuarios SET id_company = NULL");
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    await connection.commit();

    return { truncated, skipped };
  } catch (err) {
    await connection.rollback();
    try {
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    } catch {
      /* ignore */
    }
    throw err;
  }
}

async function main() {
  const args = parseResetArgs();
  assertSafeToReset(args);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "partial",
          dryRun: true,
          host: env.db.host,
          database: env.db.name,
          preserved: TABLES_PRESERVE,
          truncate: TABLES_TRUNCATE,
          postProcess: ["UPDATE usuarios SET id_company = NULL"],
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  await initializeDatabase();

  const connection = await createAdminConnection({ database: env.db.name });
  try {
    const { truncated, skipped } = await truncateOperationalData(connection);

    const summary = {
      ok: true,
      mode: "partial",
      database: env.db.name,
      preserved: TABLES_PRESERVE,
      truncated,
      skipped,
      message:
        "Dados operacionais removidos; configuração (tenants, SMTP, Teams, usuários) preservada",
    };
    logger.info(summary, "Reset parcial do banco finalizado");
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  logger.fatal({ err }, "Falha no reset parcial do banco");
  console.error(err);
  process.exit(1);
});
