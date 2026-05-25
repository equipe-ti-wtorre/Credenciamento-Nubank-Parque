#!/usr/bin/env node
/**
 * Apaga o banco MySQL inteiro (DROP DATABASE) e recria schema + seeds.
 * Uso: npm run reset-database -- --force
 */
require("dotenv").config();

const env = require("../config/env");
const { logger } = require("../config/logger");
const initializeDatabase = require("../config/setupDatabase");
const {
  parseResetArgs,
  assertSafeToReset,
  createAdminConnection,
} = require("./db-reset-shared");

async function dropDatabase() {
  const connection = await createAdminConnection();
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${env.db.name}\``);
    logger.info({ database: env.db.name }, "Banco removido (DROP DATABASE)");
  } finally {
    await connection.end();
  }
}

async function main() {
  const args = parseResetArgs();
  assertSafeToReset(args);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "full",
          dryRun: true,
          host: env.db.host,
          database: env.db.name,
          actions: ["DROP DATABASE", "initializeDatabase()"],
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  await dropDatabase();
  await initializeDatabase();

  const summary = {
    ok: true,
    mode: "full",
    database: env.db.name,
    message: "Banco recriado com schema e seeds de lookup",
  };
  logger.info(summary, "Reset total do banco finalizado");
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((err) => {
  logger.fatal({ err }, "Falha no reset total do banco");
  console.error(err);
  process.exit(1);
});
