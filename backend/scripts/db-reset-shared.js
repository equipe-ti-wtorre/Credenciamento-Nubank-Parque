const mysql = require("mysql2/promise");
const env = require("../config/env");

const TABLES_PRESERVE = [
  "azure_tenants",
  "smtp_settings",
  "system_settings",
  "teams_integrations",
  "usuarios",
  "company_type",
  "collaborator_document_type",
  "collaborator_role",
  "event_day_type",
  "bracelet_type",
  "access_status",
  "email_provider_config",
  "email_templates",
  "perfis",
  "perfil_permissoes",
  "setores",
  "setor_usuarios",
  "setor_fluxos",
  "schema_migrations",
];

const TABLES_TRUNCATE = [
  "event_day_company_collaborator_denied",
  "event_day_company_collaborator",
  "event_day_company_vehicle",
  "event_day_company",
  "event_company_notify",
  "event_day",
  "event",
  "event_accreditation_collaborator",
  "event_accreditation_bracelet",
  "event_accreditation_company",
  "event_accreditation",
  "gate_access_day_log",
  "usuario_evento_preferencias",
  "service_access_collaborator",
  "service_access_vehicle",
  "service_access_date",
  "service_access",
  "material_movement_photo",
  "material_movement_item",
  "material_movement_collaborator",
  "material_movement",
  "product",
  "storage_location",
  "aprovacao_decisoes",
  "aprovacoes",
  "alertas",
  "user_invite_tokens",
  "document_change_request",
  "company_collaborator",
  "company_contact",
  "collaborator_block_list",
  "vehicle_block_list",
  "vehicle",
  "collaborator",
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
