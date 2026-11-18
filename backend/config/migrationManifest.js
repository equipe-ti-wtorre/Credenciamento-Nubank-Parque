const {
  tableExists,
  columnExists,
  indexExists,
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
    validate: async (conn) =>
      (await allTablesExist(conn, [
        "collaborator_document_type",
        "collaborator_role",
        "collaborator",
      ])) &&
      ((await tableExists(conn, "collaborator_block_list")) ||
        (await tableExists(conn, "collaborator_black_list"))),
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
    validate: async (conn) =>
      (await tableExists(conn, "vehicle_block_list")) ||
      (await tableExists(conn, "vehicle_black_list")),
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
  {
    filename: "040_event_setor_solicitante_notify.sql",
    validate: (conn) =>
      columnExists(conn, "event", "id_setor") &&
      columnExists(conn, "event", "id_solicitante") &&
      tableExists(conn, "event_company_notify"),
  },
  {
    filename: "041_system_settings_color_palette.sql",
    validate: (conn) => columnExists(conn, "system_settings", "color_palette"),
  },
  {
    filename: "042_company_logo.sql",
    validate: (conn) => columnExists(conn, "company", "logo"),
  },
  {
    filename: "043_material_movement_collaborator.sql",
    validate: (conn) => tableExists(conn, "material_movement_collaborator"),
  },
  {
    filename: "044_material_movement_invoice_number_len.sql",
    validate: async (conn) => {
      const [rows] = await conn.query(
        `SELECT CHARACTER_MAXIMUM_LENGTH AS len
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'material_movement'
           AND COLUMN_NAME = 'invoice_number'
         LIMIT 1`,
      );
      return Number(rows[0]?.len || 0) >= 255;
    },
  },
  {
    filename: "045_material_movement_photo.sql",
    validate: (conn) => tableExists(conn, "material_movement_photo"),
  },
  {
    filename: "046_sendgrid_provider.sql",
    validate: (conn) =>
      columnExists(conn, "email_provider_config", "sendgrid_api_key_ciphertext") &&
      columnExists(conn, "email_provider_config", "sendgrid_from_email") &&
      columnExists(conn, "email_provider_config", "sendgrid_from_name"),
  },
  {
    filename: "047_sendgrid_provider_check.sql",
    validate: async (conn) => {
      const [rows] = await conn.query(
        `SELECT CHECK_CLAUSE AS clause
         FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE()
           AND CONSTRAINT_NAME = 'chk_email_provider'
         LIMIT 1`,
      );
      const clause = String(rows[0]?.clause || "").toLowerCase();
      return clause.includes("sendgrid");
    },
  },
  {
    filename: "048_email_templates.sql",
    validate: (conn) => tableExists(conn, "email_templates"),
  },
  {
    filename: "049_sendgrid_webhook_verification.sql",
    validate: (conn) =>
      columnExists(
        conn,
        "email_provider_config",
        "sendgrid_webhook_verification_key_ciphertext",
      ),
  },
  {
    filename: "050_rename_blacklist_to_blocklist.sql",
    validate: (conn) =>
      allTablesExist(conn, ["collaborator_block_list", "vehicle_block_list"]),
  },
  {
    filename: "051_collaborator_facial_enrollment.sql",
    validate: (conn) =>
      allColumnsExist(conn, "collaborator", [
        "facial_linked_id",
        "facial_user_id",
        "facial_status",
        "facial_last_correlation_id",
        "facial_devices_json",
        "facial_synced_at",
      ]) &&
      allTablesExist(conn, ["facial_enrollment_log", "facial_access_log"]),
  },
  {
    filename: "052_facial_gateway_config.sql",
    validate: (conn) => tableExists(conn, "facial_gateway_config"),
  },
  {
    filename: "053_settings_facial_permissions.sql",
    validate: async (conn) => {
      const [rows] = await conn.query(
        `SELECT 1 FROM perfil_permissoes
         WHERE modulo = 'settings_facial' AND acao = 'view'
         LIMIT 1`,
      );
      return rows.length > 0;
    },
  },
  {
    filename: "054_facial_enrollment_jobs.sql",
    validate: async (conn) =>
      (await tableExists(conn, "facial_enrollment_jobs")) &&
      (await columnExists(conn, "facial_access_log", "rec_no")),
  },
  {
    filename: "055_facial_peer_ips.sql",
    validate: (conn) =>
      allColumnsExist(conn, "facial_gateway_config", [
        "peer_origin_ip",
        "peer_destination_ip",
      ]),
  },
  {
    filename: "056_event_accreditation.sql",
    validate: (conn) =>
      allTablesExist(conn, [
        "bracelet_type",
        "event_accreditation",
        "event_accreditation_company",
        "event_accreditation_collaborator",
      ]),
  },
  {
    filename: "057_event_accreditation_no_responsavel.sql",
    validate: async (conn) => {
      const [rows] = await conn.query(
        `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_accreditation'
            AND COLUMN_NAME = 'id_company_responsavel' LIMIT 1`,
      );
      return rows[0]?.IS_NULLABLE === "YES";
    },
  },
  {
    filename: "058_facial_job_valid_dates.sql",
    validate: (conn) =>
      allColumnsExist(conn, "facial_enrollment_jobs", [
        "valid_date_start",
        "valid_date_end",
      ]),
  },
  {
    filename: "059_event_accreditation_bracelet.sql",
    validate: (conn) => tableExists(conn, "event_accreditation_bracelet"),
  },
  {
    filename: "060_gate_day_log_multi_cycle.sql",
    validate: async (conn) => {
      const [uq] = await conn.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'gate_access_day_log'
            AND INDEX_NAME = 'uq_gate_day_log_ref_date'
          LIMIT 1`,
      );
      if (uq.length) return false;
      const [idx] = await conn.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'gate_access_day_log'
            AND INDEX_NAME = 'idx_gate_day_log_ref_date'
          LIMIT 1`,
      );
      return idx.length > 0;
    },
  },
  {
    filename: "061_event_accreditation_decision.sql",
    validate: (conn) =>
      allColumnsExist(conn, "event_accreditation_collaborator", [
        "decided_by",
        "decided_at",
        "decision_reason",
      ]),
  },
  {
    filename: "062_event_accreditation_internal.sql",
    validate: async (conn) =>
      (await allColumnsExist(conn, "event_accreditation", ["internal_enabled"])) &&
      (await tableExists(conn, "event_accreditation_internal")) &&
      (await tableExists(conn, "event_accreditation_internal_bracelet")) &&
      (await tableExists(conn, "event_accreditation_internal_notify_user")) &&
      (await columnExists(conn, "system_settings", "ea_internal_notify_all")),
  },
  {
    filename: "063_event_accreditation_internal_multi_bracelet.sql",
    validate: async (conn) => {
      const [rows] = await conn.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'event_accreditation_internal'
            AND INDEX_NAME IN (
              'uk_eai_accreditation_usuario_bracelet',
              'uk_eai_accreditation_usuario'
            )
          LIMIT 1`,
      );
      return rows.length > 0;
    },
  },
  {
    filename: "064_event_accreditation_days_and_single_bracelet.sql",
    validate: async (conn) => {
      const [uk] = await conn.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'event_accreditation_internal'
            AND INDEX_NAME IN (
              'uk_eai_accreditation_usuario',
              'uk_eai_accreditation_usuario_bracelet'
            )
          LIMIT 1`,
      );
      return uk.length > 0 && (await tableExists(conn, "event_accreditation_day"));
    },
  },
  {
    filename: "065_event_accreditation_cover_and_invite.sql",
    validate: async (conn) =>
      (await columnExists(conn, "event_accreditation", "cover")) &&
      (await tableExists(conn, "event_accreditation_invite")) &&
      (await tableExists(conn, "event_accreditation_invite_file")),
  },
  {
    filename: "066_bracelet_type_icon_color.sql",
    validate: (conn) => allColumnsExist(conn, "bracelet_type", ["icon", "color"]),
  },
  {
    filename: "067_gate_day_log_event.sql",
    validate: (conn) => columnExists(conn, "gate_access_day_log", "id_event"),
  },
  {
    filename: "068_facial_released_at.sql",
    validate: async (conn) =>
      (await allColumnsExist(conn, "service_access_collaborator", ["facial_released_at"])) &&
      (await allColumnsExist(conn, "event_day_company_collaborator", ["facial_released_at"])),
  },
  {
    filename: "069_event_accreditation_multi_setor.sql",
    validate: async (conn) =>
      (await tableExists(conn, "event_accreditation_setor")) &&
      (await columnExists(conn, "event_accreditation_company", "id_setor")) &&
      (await tableExists(conn, "event_accreditation_notify_log")),
  },
  {
    filename: "070_event_accreditation_delete_permission.sql",
    validate: async (conn) => {
      const [rows] = await conn.query(
        `SELECT 1 FROM perfil_permissoes pp
           INNER JOIN perfis p ON p.id = pp.id_perfil
          WHERE pp.modulo = 'event_accreditation' AND pp.acao = 'delete'
            AND (p.codigo = 'ADMIN' OR p.is_super_admin = 1)
          LIMIT 1`,
      );
      return rows.length > 0;
    },
  },
  {
    filename: "071_collaborator_blocklist_period.sql",
    validate: (conn) =>
      allColumnsExist(conn, "collaborator_block_list", [
        "block_type",
        "block_value",
        "blocked_until",
      ]),
  },
  {
    filename: "072_event_accreditation_delete_for_editors.sql",
    validate: async (conn) => {
      const [rows] = await conn.query(
        `SELECT 1
           FROM perfil_permissoes e
          WHERE e.modulo = 'event_accreditation' AND e.acao IN ('edit', 'create')
            AND NOT EXISTS (
              SELECT 1 FROM perfil_permissoes d
               WHERE d.id_perfil = e.id_perfil
                 AND d.modulo = 'event_accreditation'
                 AND d.acao = 'delete'
            )
          LIMIT 1`,
      );
      return rows.length === 0;
    },
  },
  {
    filename: "073_setor_contatos.sql",
    validate: (conn) =>
      tableExists(conn, "setor_contatos") &&
      allColumnsExist(conn, "setor_contatos", ["nome", "telefone", "ramal", "email"]),
  },
  {
    filename: "074_service_access_schedule.sql",
    validate: async (conn) =>
      (await allColumnsExist(conn, "system_settings", [
        "comercial_start",
        "comercial_end",
        "noturno_start",
        "noturno_end",
      ])) &&
      (await allColumnsExist(conn, "service_access", [
        "schedule_type",
        "schedule_start",
        "schedule_end",
        "schedule_crosses_midnight",
      ])),
  },
  {
    filename: "075_event_day_multi_type.sql",
    validate: async (conn) => {
      const [rows] = await conn.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'event_day'
            AND INDEX_NAME = 'uk_event_day_event_date_type'
          LIMIT 1`,
      );
      return rows.length > 0;
    },
  },
  {
    filename: "076_company_self_register.sql",
    validate: (conn) =>
      tableExists(conn, "company_self_register_tokens") &&
      allColumnsExist(conn, "company_self_register_tokens", [
        "token_hash",
        "email",
        "name",
        "id_company_type",
        "expires_at",
        "used_at",
        "id_company",
      ]),
  },
  {
    filename: "077_event_cover.sql",
    validate: (conn) => columnExists(conn, "event", "cover"),
  },
  {
    filename: "078_audit_module_permissions.sql",
    validate: async (conn) => {
      const [rows] = await conn.query(
        `SELECT 1 FROM perfil_permissoes
          WHERE modulo = 'audit' AND acao = 'view'
          LIMIT 1`,
      );
      return rows.length > 0;
    },
  },
  {
    filename: "079_drop_document_change.sql",
    validate: async (conn) => {
      if (await tableExists(conn, "document_change_request")) return false;
      const [permRows] = await conn.query(
        `SELECT 1 FROM perfil_permissoes
          WHERE modulo = 'document_approvals'
          LIMIT 1`,
      );
      return permRows.length === 0;
    },
  },
  {
    filename: "080_material_stock_balance.sql",
    validate: (conn) => tableExists(conn, "material_stock_balance"),
  },
  {
    filename: "081_material_movement_request_id.sql",
    validate: (conn) => columnExists(conn, "material_movement", "request_id"),
  },
  {
    filename: "082_material_movement_eventual.sql",
    validate: (conn) =>
      allColumnsExist(conn, "material_movement", [
        "movement_nature",
        "origin_type",
        "no_invoice_reason",
        "sender_name",
        "vehicle_plate",
      ]),
  },
  {
    filename: "083_external_company.sql",
    validate: (conn) =>
      tableExists(conn, "external_company") &&
      columnExists(conn, "material_movement", "id_external_company"),
  },
  {
    filename: "084_event_accreditation_photo_required.sql",
    validate: (conn) => columnExists(conn, "event_accreditation", "photo_required"),
  },
  {
    filename: "085_perfil_setores.sql",
    validate: (conn) => tableExists(conn, "perfil_setores"),
  },
  {
    filename: "086_company_origem.sql",
    validate: (conn) => columnExists(conn, "company", "id_company_origem"),
  },
  {
    filename: "087_facial_devices.sql",
    validate: (conn) => tableExists(conn, "facial_devices"),
  },
  {
    filename: "088_public_id.sql",
    validate: async (conn) => {
      const tables = [
        "event",
        "event_accreditation",
        "service_access",
        "setores",
        "aprovacoes",
        "company",
        "collaborator",
        "usuarios",
        "perfis",
        "azure_tenants",
        "vehicle",
        "teams_integrations",
        "alertas",
        "product",
        "storage_location",
        "external_company",
        "bracelet_type",
        "collaborator_role",
        "collaborator_block_list",
        "event_day",
        "event_day_company",
        "event_day_company_vehicle",
        "event_day_company_collaborator",
        "setor_contatos",
        "setor_usuarios",
        "event_accreditation_company",
        "event_accreditation_collaborator",
        "event_accreditation_invite_file",
        "event_accreditation_day",
        "event_accreditation_setor",
        "service_access_collaborator",
        "service_access_vehicle",
        "company_contact",
        "aprovacao_decisoes",
        "material_movement",
        "material_movement_item",
        "company_type",
        "collaborator_document_type",
        "event_day_type",
        "access_status",
      ];
      for (const table of tables) {
        if (!(await columnExists(conn, table, "public_id"))) return false;
      }
      return true;
    },
  },
  {
    filename: "089_event_accreditation_internal_multi_bracelet.sql",
    validate: async (conn) => {
      const [multi] = await conn.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'event_accreditation_internal'
            AND INDEX_NAME = 'uk_eai_accreditation_usuario_bracelet'
          LIMIT 1`,
      );
      const [single] = await conn.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'event_accreditation_internal'
            AND INDEX_NAME = 'uk_eai_accreditation_usuario'
          LIMIT 1`,
      );
      return multi.length > 0 && single.length === 0;
    },
  },
  {
    filename: "090_setor_usuario_fluxos.sql",
    validate: (conn) => tableExists(conn, "setor_usuario_fluxos"),
  },
  {
    filename: "091_facial_device_access_cursor.sql",
    validate: (conn) => columnExists(conn, "facial_devices", "last_rec_no"),
  },
  {
    filename: "092_facial_devices_public_id.sql",
    validate: (conn) => columnExists(conn, "facial_devices", "public_id"),
  },
  {
    filename: "093_whatsapp_provider.sql",
    validate: (conn) =>
      allTablesExist(conn, ["whatsapp_provider_config", "whatsapp_send_logs"]),
  },
  {
    filename: "094_event_accreditation_internal_public_id.sql",
    validate: (conn) => columnExists(conn, "event_accreditation_internal", "public_id"),
  },
  {
    filename: "095_refresh_tokens_gateway_sid.sql",
    validate: (conn) => columnExists(conn, "refresh_tokens", "gateway_sid"),
  },
  {
    filename: "096_password_reset_tokens.sql",
    validate: (conn) => tableExists(conn, "password_reset_tokens"),
  },
  {
    filename: "097_collaborator_picture_index.sql",
    validate: (conn) => indexExists(conn, "collaborator", "idx_collaborator_picture"),
  },
  {
    filename: "098_directory_sync_since.sql",
    validate: (conn) => columnExists(conn, "system_settings", "directory_sync_since"),
  },
];

module.exports = migrations;
