#!/usr/bin/env node
/**
 * Arquiva registros antigos de app_error_logs para JSONL.gz (cold storage).
 * Uso:
 *   npm run archive-error-logs
 */
require("dotenv").config();

const initializeDatabase = require("../config/setupDatabase");
const { logger } = require("../config/logger");
const { runErrorLogsRetention } = require("../modules/error-logs/error-logs.retention");

async function main() {
  await initializeDatabase();
  const result = await runErrorLogsRetention({ triggeredBy: "script" });
  logger.info({ result }, "Script arquivamento app_error_logs finalizado");
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  logger.fatal({ err }, "Falha no script arquivamento app_error_logs");
  console.error(err);
  process.exit(1);
});
