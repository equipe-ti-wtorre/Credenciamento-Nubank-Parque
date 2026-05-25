#!/usr/bin/env node
/**
 * Arquiva registros antigos de audit_logs para JSONL.gz (cold storage).
 * Uso manual ou via crontab do sistema:
 *   npm run archive-audit-logs
 */
require("dotenv").config();

const initializeDatabase = require("../config/setupDatabase");
const { logger } = require("../config/logger");
const { runAuditLogsRetention } = require("../observability/audit.retention");

async function main() {
  await initializeDatabase();
  const result = await runAuditLogsRetention({ triggeredBy: "script" });
  logger.info({ result }, "Script arquivamento audit_logs finalizado");
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  logger.fatal({ err }, "Falha no script arquivamento audit_logs");
  console.error(err);
  process.exit(1);
});
