const mysql = require("mysql2/promise");
const env = require("../config/env");

const TABLES_PRESERVE = [
  "azure_tenants",
  "smtp_settings",
  "teams_integrations",
  "usuarios",
  "company_type",
  "collaborator_document_type",
  "collaborator_role",
  "event_day_type",
  "access_status",
];

const TABLES_TRUNCATE = [
  "event_day_company_collaborator_denied",
  "event_day_company_collaborator",
  "event_day_company",
  "event_day",
  "event",
  "collaborator_black_list",
  "collaborator",
  "company_contact",
  "company",
  "refresh_tokens",
  "audit_logs",
  "smtp_send_logs",
  "app_error_logs",
];

function parseResetArgs(argv = process.argv.slice(2)) {
  return {
    force: argv.includes("--force"),
    dryRun: argv.includes("--dry-run"),
  };
}

function assertSafeToReset({ force, dryRun }) {
  if (dryRun) return;

  if (!force) {
    console.error(
      "Operação destrutiva bloqueada. Use --force para confirmar.\n" +
        "  Ex.: npm run reset-database -- --force\n" +
        "  Ex.: npm run reset-database-data -- --force",
    );
    process.exit(1);
  }

  if (
    env.isProduction &&
    process.env.DB_RESET_ALLOW_PRODUCTION !== "true"
  ) {
    console.error(
      "Reset bloqueado em NODE_ENV=production.\n" +
        "Defina DB_RESET_ALLOW_PRODUCTION=true no .env apenas se tiver certeza.",
    );
    process.exit(1);
  }
}

async function createAdminConnection({ database } = {}) {
  const options = {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    connectTimeout: env.db.connectTimeout,
  };
  if (database) options.database = database;
  return mysql.createConnection(options);
}

module.exports = {
  TABLES_PRESERVE,
  TABLES_TRUNCATE,
  parseResetArgs,
  assertSafeToReset,
  createAdminConnection,
};
