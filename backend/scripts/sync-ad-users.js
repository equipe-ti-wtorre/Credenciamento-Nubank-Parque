#!/usr/bin/env node
/**
 * Sincroniza usuários do Azure AD para a tabela usuarios.
 * Uso manual ou via crontab do sistema:
 *   node scripts/sync-ad-users.js
 */
require("dotenv").config();

const initializeDatabase = require("../config/setupDatabase");
const { logger } = require("../config/logger");
const { runAdUsersSync } = require("../utils/adUsersSync");

async function main() {
  await initializeDatabase();
  const result = await runAdUsersSync({ triggeredBy: "script" });
  logger.info({ result }, "Script sync AD finalizado");
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  logger.fatal({ err }, "Falha no script sync AD");
  console.error(err);
  process.exit(1);
});
