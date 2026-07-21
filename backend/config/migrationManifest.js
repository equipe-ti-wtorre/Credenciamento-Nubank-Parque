const {
  tableExists,
  columnExists,
  allTablesExist,
  allColumnsExist,
} = require("./schemaHelpers");

const migrations = [
  {
    filename: "001_refresh_and_audit.sql",
    referenceOnly: true,
    validate: (conn) => allTablesExist(conn, ["refresh_tokens", "audit_logs"]),
  },
  {
    filename: "002_app_error_logs.sql",
    referenceOnly: true,
    validate: (conn) => tableExists(conn, "app_error_logs"),
  },
  {
    filename: "003_smtp_teams.sql",
    referenceOnly: true,
    validate: (conn) =>
      allTablesExist(conn, ["smtp_settings", "smtp_send_logs", "teams_integrations"]),
  },
  {
    filename: "003_usuarios_departamento.sql",
    referenceOnly: true,
    validate: (conn) => columnExists(conn, "usuarios", "departamento"),
  },
  {
    filename: "004_teams_user_notifications.sql",
    referenceOnly: true,
    validate: (conn) =>
      columnExists(conn, "teams_integrations", "tipo") &&
      columnExists(conn, "teams_integrations", "destinatario_email"),
  },
  {
    filename: "005_teams_activity_web_url.sql",
    referenceOnly: true,
    validate: (conn) => columnExists(conn, "teams_integrations", "activity_web_url"),
  },
  {
    filename: "006_teams_app_id.sql",
    referenceOnly: true,
    validate: (conn) => columnExists(conn, "teams_integrations", "teams_app_id"),
  },
  {
    filename: "007_companies.sql",
    referenceOnly: true,
    validate: (conn) =>
      allTablesExist(conn, ["company_type", "company", "company_contact"]),
  },
  {
    filename: "008_collaborators.sql",
    referenceOnly: true,
    validate: (conn) =>
      allTablesExist(conn, [
        "collaborator_document_type",
        "collaborator_role",
        "collaborator",
        "collaborator_black_list",
      ]),
  },
  {
    filename: "009_events.sql",
    referenceOnly: true,
    validate: (conn) =>
      allTablesExist(conn, ["event", "event_day_type", "event_day", "event_day_company"]),
  },
  {
    filename: "010_credentials.sql",
    referenceOnly: true,
    validate: (conn) =>
      allTablesExist(conn, [
        "access_status",
        "event_day_company_collaborator",
        "event_day_company_collaborator_denied",
      ]),
  },
  {
    filename: "011_gate.sql",
    referenceOnly: true,
    validate: (conn) =>
      allColumnsExist(conn, "event_day_company_collaborator", [
        "access_check_in",
        "access_check_out",
        "id_substitute",
      ]),
  },
  {
    filename: "012_system_settings.sql",
    referenceOnly: true,
    validate: (conn) => tableExists(conn, "system_settings"),
  },
  {
    filename: "013_phase2_features.sql",
    referenceOnly: true,
    validate: (conn) =>
      allTablesExist(conn, [
        "vehicle",
        "service_access",
        "service_access_date",
        "service_access_vehicle",
        "document_change_request",
      ]),
  },
  {
    filename: "014_merchandise.sql",
    validate: (conn) =>
      allTablesExist(conn, [
        "storage_location",
        "product",
        "material_movement",
        "material_movement_item",
      ]),
  },
  {
    filename: "015b_vehicle_fields.sql",
    validate: (conn) =>
      allColumnsExist(conn, "vehicle", ["brand", "model", "color", "type"]),
  },
  {
    filename: "016_user_session_idle.sql",
    referenceOnly: true,
    validate: (conn) => columnExists(conn, "usuarios", "session_idle_minutes"),
  },
  {
    filename: "016_vehicle_blacklist.sql",
    validate: (conn) => tableExists(conn, "vehicle_black_list"),
  },
  {
    filename: "017_service_access_evolution.sql",
    referenceOnly: true,
    validate: (conn) =>
      allColumnsExist(conn, "service_access", [
        "start_date",
        "end_date",
        "finalidade",
        "requesting_department",
        "observacao",
        "status",
      ]) && tableExists(conn, "service_access_collaborator"),
  },
  {
    filename: "018_setores_aprovacoes.sql",
    referenceOnly: true,
    validate: (conn) =>
      allTablesExist(conn, [
        "setores",
        "setor_usuarios",
        "setor_fluxos",
        "aprovacoes",
        "aprovacao_decisoes",
      ]),
  },
  {
    filename: "019_setor_papeis.sql",
    referenceOnly: true,
    validate: async (conn) => {
      if (!(await columnExists(conn, "setor_usuarios", "papel"))) return false;
      return !(await columnExists(conn, "setor_usuarios", "nivel_aprovacao"));
    },
  },
  {
    filename: "020_perfis_permissoes.sql",
    validate: (conn) => allTablesExist(conn, ["perfis", "perfil_permissoes"]),
  },
  {
    filename: "021_drop_usuarios_perfil.sql",
    referenceOnly: true,
    validate: async (conn) => !(await columnExists(conn, "usuarios", "perfil")),
  },
  {
    filename: "022_service_access_vehicle_driver.sql",
    validate: (conn) => columnExists(conn, "service_access_vehicle", "id_driver"),
  },
  {
    filename: "023_aprovacao_decisoes_metadata.sql",
    validate: (conn) => columnExists(conn, "aprovacao_decisoes", "metadata"),
  },
  {
    filename: "024_alertas.sql",
    validate: (conn) => tableExists(conn, "alertas"),
  },
  {
    filename: "025_notificar_portaria.sql",
    validate: (conn) => columnExists(conn, "usuarios", "notificar_portaria"),
  },
  {
    filename: "026_alertas_excluido.sql",
    validate: (conn) => columnExists(conn, "alertas", "excluido_em"),
  },
  {
    filename: "027_usuario_evento_preferencias.sql",
    validate: (conn) => tableExists(conn, "usuario_evento_preferencias"),
  },
  {
    filename: "028_service_access_notificar_entrada.sql",
    validate: (conn) => columnExists(conn, "service_access", "notificar_entrada"),
  },
  {
    filename: "029_service_access_notificar_entrada_split.sql",
    validate: (conn) =>
      allColumnsExist(conn, "service_access", [
        "notificar_entrada_colaborador",
        "notificar_entrada_veiculo",
      ]),
  },
  {
    filename: "030_fix_gate_timezone_20260716.sql",
    validate: async (conn) => {
      const [rows] = await conn.query(
        "SELECT 1 FROM schema_migrations WHERE filename = ? LIMIT 1",
        ["030_fix_gate_timezone_20260716.sql"],
      );
      return rows.length > 0;
    },
  },
  {
    filename: "031_gate_access_day_log.sql",
    validate: (conn) => tableExists(conn, "gate_access_day_log"),
  },
  {
    filename: "032_authorization_expiration.sql",
    validate: async (conn) => {
      const [statusRows] = await conn.query(
        `SELECT 1 FROM access_status WHERE id_access_status = 5 LIMIT 1`,
      );
      if (!statusRows.length) return false;
      const [colRows] = await conn.query(
        `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'aprovacoes'
            AND COLUMN_NAME = 'status'
          LIMIT 1`,
      );
      const columnType = String(colRows[0]?.COLUMN_TYPE || "").toUpperCase();
      return columnType.includes("'EXPIRADO'");
    },
  },
  {
    filename: "033_event_company_responsavel.sql",
    validate: (conn) => columnExists(conn, "event", "id_company_responsavel"),
  },
  {
    filename: "034_company_users_invite.sql",
    validate: (conn) =>
      columnExists(conn, "collaborator", "id_company") &&
      tableExists(conn, "user_invite_tokens"),
  },
  {
    filename: "035_email_provider_config.sql",
    validate: (conn) =>
      tableExists(conn, "email_provider_config") &&
      columnExists(conn, "smtp_send_logs", "message_id") &&
      columnExists(conn, "smtp_send_logs", "provider"),
  },
  {
    filename: "036_company_collaborator.sql",
    validate: (conn) => tableExists(conn, "company_collaborator"),
  },
  {
    filename: "037_backfill_company_collaborator.sql",
    validate: async (conn) => {
      const [rows] = await conn.query(
        "SELECT 1 FROM schema_migrations WHERE filename = ? LIMIT 1",
        ["037_backfill_company_collaborator.sql"],
      );
      return rows.length > 0;
    },
  },
  {
    filename: "038_event_day_company_vehicle.sql",
    validate: (conn) => tableExists(conn, "event_day_company_vehicle"),
  },
  {
    filename: "039_event_ativo.sql",
    validate: (conn) => columnExists(conn, "event", "ativo"),
  },
];

module.exports = migrations;
