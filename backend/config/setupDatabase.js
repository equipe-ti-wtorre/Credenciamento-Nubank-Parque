const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const env = require("./env");
const { logger } = require("./logger");

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [env.db.name, table, column],
  );
  return rows.length > 0;
}

async function columnIsNullable(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [env.db.name, table, column],
  );
  return rows[0]?.IS_NULLABLE === "YES";
}

/** Atualiza tabelas criadas antes da integração Teams por usuário. */
async function migrateTeamsIntegrations(connection) {
  const [tables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'teams_integrations' LIMIT 1`,
    [env.db.name],
  );
  if (tables.length === 0) return;

  if (!(await columnExists(connection, "teams_integrations", "tipo"))) {
    await connection.query(`
      ALTER TABLE teams_integrations
      ADD COLUMN tipo ENUM('user', 'channel') NOT NULL DEFAULT 'user' AFTER nome
    `);
    logger.info("Migration: teams_integrations.tipo adicionada");
  }

  if (!(await columnExists(connection, "teams_integrations", "destinatario_email"))) {
    await connection.query(`
      ALTER TABLE teams_integrations
      ADD COLUMN destinatario_email VARCHAR(255) NULL AFTER channel_id
    `);
    logger.info("Migration: teams_integrations.destinatario_email adicionada");
  }

  if (!(await columnIsNullable(connection, "teams_integrations", "team_id"))) {
    await connection.query(`
      ALTER TABLE teams_integrations MODIFY COLUMN team_id VARCHAR(64) NULL
    `);
    logger.info("Migration: teams_integrations.team_id agora nullable");
  }

  if (!(await columnIsNullable(connection, "teams_integrations", "channel_id"))) {
    await connection.query(`
      ALTER TABLE teams_integrations MODIFY COLUMN channel_id VARCHAR(128) NULL
    `);
    logger.info("Migration: teams_integrations.channel_id agora nullable");
  }

  if (!(await columnExists(connection, "teams_integrations", "activity_web_url"))) {
    await connection.query(`
      ALTER TABLE teams_integrations
      ADD COLUMN activity_web_url VARCHAR(500) NULL AFTER destinatario_email
    `);
    logger.info("Migration: teams_integrations.activity_web_url adicionada");
  }

  if (!(await columnExists(connection, "teams_integrations", "teams_app_id"))) {
    await connection.query(`
      ALTER TABLE teams_integrations
      ADD COLUMN teams_app_id VARCHAR(64) NULL AFTER activity_web_url
    `);
    logger.info("Migration: teams_integrations.teams_app_id adicionada");
  }

  await connection.query(`
    UPDATE teams_integrations
    SET tipo = 'channel'
    WHERE tipo = 'user'
      AND team_id IS NOT NULL
      AND channel_id IS NOT NULL
      AND (destinatario_email IS NULL OR destinatario_email = '')
  `);
}

async function migrateUsuarios(connection) {
  const [tables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' LIMIT 1`,
    [env.db.name],
  );
  if (tables.length === 0) return;

  if (!(await columnExists(connection, "usuarios", "departamento"))) {
    await connection.query(`
      ALTER TABLE usuarios
      ADD COLUMN departamento VARCHAR(200) NULL AFTER email
    `);
    logger.info("Migration: usuarios.departamento adicionada");
  }

  await connection.query(`
    UPDATE usuarios SET departamento = 'Administração'
    WHERE departamento IS NULL OR TRIM(departamento) = ''
      AND perfil = 'ADMIN' AND is_ad_user = 0
    LIMIT 1
  `);

  await migrateUsuariosCompanyLink(connection);

  if (!(await columnExists(connection, "usuarios", "session_idle_minutes"))) {
    await connection.query(`
      ALTER TABLE usuarios
      ADD COLUMN session_idle_minutes INT NULL DEFAULT NULL
      COMMENT 'NULL=padrao sistema, 0=desativado, 5-480=personalizado'
    `);
    logger.info("Migration: usuarios.session_idle_minutes adicionada");
  }
}

async function migrateCompanies(connection) {
  const [tables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'company_type' LIMIT 1`,
    [env.db.name],
  );
  if (tables.length === 0) {
    await connection.query(`
      CREATE TABLE company_type (
        id_company_type INT AUTO_INCREMENT PRIMARY KEY,
        description VARCHAR(100) NOT NULL,
        UNIQUE KEY uk_company_type_description (description)
      )
    `);
    logger.info("Migration: tabela company_type criada");
  }

  const [companyTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'company' LIMIT 1`,
    [env.db.name],
  );
  if (companyTables.length === 0) {
    await connection.query(`
      CREATE TABLE company (
        id_company INT AUTO_INCREMENT PRIMARY KEY,
        id_company_type INT NOT NULL,
        cnpj VARCHAR(14) NOT NULL,
        company_name VARCHAR(200) NOT NULL,
        fancy_name VARCHAR(200) NULL,
        status TINYINT(1) NOT NULL DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_company_cnpj (cnpj),
        INDEX idx_company_type (id_company_type),
        INDEX idx_company_status (status),
        FOREIGN KEY (id_company_type) REFERENCES company_type(id_company_type) ON DELETE RESTRICT
      )
    `);
    logger.info("Migration: tabela company criada");
  }

  const [contactTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'company_contact' LIMIT 1`,
    [env.db.name],
  );
  if (contactTables.length === 0) {
    await connection.query(`
      CREATE TABLE company_contact (
        id_company_contact INT AUTO_INCREMENT PRIMARY KEY,
        id_company INT NOT NULL,
        name VARCHAR(200) NOT NULL,
        department VARCHAR(100) NULL,
        phone VARCHAR(30) NULL,
        email VARCHAR(200) NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_company_contact_company (id_company),
        FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE CASCADE
      )
    `);
    logger.info("Migration: tabela company_contact criada");
  }
}

async function migrateCollaborators(connection) {
  const [docTypeTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'collaborator_document_type' LIMIT 1`,
    [env.db.name],
  );
  if (docTypeTables.length === 0) {
    await connection.query(`
      CREATE TABLE collaborator_document_type (
        id_collaborator_document_type INT AUTO_INCREMENT PRIMARY KEY,
        description VARCHAR(100) NOT NULL,
        UNIQUE KEY uk_collaborator_document_type_description (description)
      )
    `);
    logger.info("Migration: tabela collaborator_document_type criada");
  }

  const [roleTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'collaborator_role' LIMIT 1`,
    [env.db.name],
  );
  if (roleTables.length === 0) {
    await connection.query(`
      CREATE TABLE collaborator_role (
        id_collaborator_role INT AUTO_INCREMENT PRIMARY KEY,
        description VARCHAR(100) NOT NULL,
        UNIQUE KEY uk_collaborator_role_description (description)
      )
    `);
    logger.info("Migration: tabela collaborator_role criada");
  }

  const [collabTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'collaborator' LIMIT 1`,
    [env.db.name],
  );
  if (collabTables.length === 0) {
    await connection.query(`
      CREATE TABLE collaborator (
        id_collaborator INT AUTO_INCREMENT PRIMARY KEY,
        id_collaborator_document_type INT NOT NULL,
        id_collaborator_role INT NOT NULL,
        document VARCHAR(50) NOT NULL,
        name VARCHAR(200) NOT NULL,
        rg VARCHAR(30) NULL,
        phone VARCHAR(30) NULL,
        status TINYINT(1) NOT NULL DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_collaborator_document (document, id_collaborator_document_type),
        INDEX idx_collaborator_document_type (id_collaborator_document_type),
        INDEX idx_collaborator_role (id_collaborator_role),
        INDEX idx_collaborator_status (status),
        INDEX idx_collaborator_name (name),
        FOREIGN KEY (id_collaborator_document_type) REFERENCES collaborator_document_type(id_collaborator_document_type) ON DELETE RESTRICT,
        FOREIGN KEY (id_collaborator_role) REFERENCES collaborator_role(id_collaborator_role) ON DELETE RESTRICT
      )
    `);
    logger.info("Migration: tabela collaborator criada");
  }

  const [blacklistTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'collaborator_black_list' LIMIT 1`,
    [env.db.name],
  );
  if (blacklistTables.length === 0) {
    await connection.query(`
      CREATE TABLE collaborator_black_list (
        id_collaborator INT NOT NULL PRIMARY KEY,
        reason VARCHAR(500) NOT NULL,
        id_usuario INT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_collaborator) REFERENCES collaborator(id_collaborator) ON DELETE CASCADE,
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE SET NULL
      )
    `);
    logger.info("Migration: tabela collaborator_black_list criada");
  }
}

async function migrateEvents(connection) {
  const [eventTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event' LIMIT 1`,
    [env.db.name],
  );
  if (eventTables.length === 0) {
    await connection.query(`
      CREATE TABLE event (
        id_event INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        start DATE NOT NULL,
        end DATE NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_event_dates (start, end)
      )
    `);
    logger.info("Migration: tabela event criada");
  }

  const [typeTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_day_type' LIMIT 1`,
    [env.db.name],
  );
  if (typeTables.length === 0) {
    await connection.query(`
      CREATE TABLE event_day_type (
        id_event_day_type INT AUTO_INCREMENT PRIMARY KEY,
        description VARCHAR(100) NOT NULL,
        UNIQUE KEY uk_event_day_type_description (description)
      )
    `);
    logger.info("Migration: tabela event_day_type criada");
  }

  const [dayTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_day' LIMIT 1`,
    [env.db.name],
  );
  if (dayTables.length === 0) {
    await connection.query(`
      CREATE TABLE event_day (
        id_event_day INT AUTO_INCREMENT PRIMARY KEY,
        id_event INT NOT NULL,
        id_type INT NOT NULL,
        date DATE NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_event_day_event (id_event),
        INDEX idx_event_day_event_date (id_event, date),
        FOREIGN KEY (id_event) REFERENCES event(id_event) ON DELETE CASCADE,
        FOREIGN KEY (id_type) REFERENCES event_day_type(id_event_day_type) ON DELETE RESTRICT
      )
    `);
    logger.info("Migration: tabela event_day criada");
  }

  const [edcTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_day_company' LIMIT 1`,
    [env.db.name],
  );
  if (edcTables.length === 0) {
    await connection.query(`
      CREATE TABLE event_day_company (
        id_event_day_company INT AUTO_INCREMENT PRIMARY KEY,
        id_event_day INT NOT NULL,
        id_company INT NOT NULL,
        id_producer INT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_event_day_company_day_company (id_event_day, id_company),
        INDEX idx_event_day_company_day (id_event_day),
        INDEX idx_event_day_company_company (id_company),
        INDEX idx_event_day_company_producer (id_producer),
        FOREIGN KEY (id_event_day) REFERENCES event_day(id_event_day) ON DELETE CASCADE,
        FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE RESTRICT,
        FOREIGN KEY (id_producer) REFERENCES company(id_company) ON DELETE RESTRICT
      )
    `);
    logger.info("Migration: tabela event_day_company criada");
  }
}

async function migrateCredentials(connection) {
  const [statusTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'access_status' LIMIT 1`,
    [env.db.name],
  );
  if (statusTables.length === 0) {
    await connection.query(`
      CREATE TABLE access_status (
        id_access_status INT AUTO_INCREMENT PRIMARY KEY,
        description VARCHAR(100) NOT NULL,
        UNIQUE KEY uk_access_status_description (description)
      )
    `);
    logger.info("Migration: tabela access_status criada");
  }

  const [credTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_day_company_collaborator' LIMIT 1`,
    [env.db.name],
  );
  if (credTables.length === 0) {
    await connection.query(`
      CREATE TABLE event_day_company_collaborator (
        id_event_day_company_collaborator INT AUTO_INCREMENT PRIMARY KEY,
        id_event_day_company INT NOT NULL,
        id_collaborator INT NOT NULL,
        id_access_status INT NOT NULL,
        id_collaborator_role INT NOT NULL,
        access_id CHAR(36) NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_edcc_event_day_company (id_event_day_company),
        INDEX idx_edcc_collaborator (id_collaborator),
        INDEX idx_edcc_access_status (id_access_status),
        FOREIGN KEY (id_event_day_company) REFERENCES event_day_company(id_event_day_company) ON DELETE RESTRICT,
        FOREIGN KEY (id_collaborator) REFERENCES collaborator(id_collaborator) ON DELETE RESTRICT,
        FOREIGN KEY (id_access_status) REFERENCES access_status(id_access_status) ON DELETE RESTRICT,
        FOREIGN KEY (id_collaborator_role) REFERENCES collaborator_role(id_collaborator_role) ON DELETE RESTRICT
      )
    `);
    logger.info("Migration: tabela event_day_company_collaborator criada");
  }

  const [deniedTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_day_company_collaborator_denied' LIMIT 1`,
    [env.db.name],
  );
  if (deniedTables.length === 0) {
    await connection.query(`
      CREATE TABLE event_day_company_collaborator_denied (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_event_day_company_collaborator INT NOT NULL,
        id_access_status INT NOT NULL,
        reason VARCHAR(500) NOT NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_edcc_denied_credential (id_event_day_company_collaborator),
        FOREIGN KEY (id_event_day_company_collaborator) REFERENCES event_day_company_collaborator(id_event_day_company_collaborator) ON DELETE CASCADE,
        FOREIGN KEY (id_access_status) REFERENCES access_status(id_access_status) ON DELETE RESTRICT
      )
    `);
    logger.info("Migration: tabela event_day_company_collaborator_denied criada");
  }
}

async function indexExists(connection, table, indexName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [env.db.name, table, indexName],
  );
  return rows.length > 0;
}

async function migrateGate(connection) {
  const [credTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_day_company_collaborator' LIMIT 1`,
    [env.db.name],
  );
  if (credTables.length === 0) return;

  if (!(await columnExists(connection, "event_day_company_collaborator", "access_check_in"))) {
    await connection.query(`
      ALTER TABLE event_day_company_collaborator
      ADD COLUMN access_check_in DATETIME NULL AFTER access_id
    `);
    logger.info("Migration: event_day_company_collaborator.access_check_in adicionada");
  }

  if (!(await columnExists(connection, "event_day_company_collaborator", "access_check_out"))) {
    await connection.query(`
      ALTER TABLE event_day_company_collaborator
      ADD COLUMN access_check_out DATETIME NULL AFTER access_check_in
    `);
    logger.info("Migration: event_day_company_collaborator.access_check_out adicionada");
  }

  if (!(await columnExists(connection, "event_day_company_collaborator", "id_substitute"))) {
    await connection.query(`
      ALTER TABLE event_day_company_collaborator
      ADD COLUMN id_substitute INT NULL AFTER access_check_out,
      ADD CONSTRAINT fk_edcc_substitute
        FOREIGN KEY (id_substitute) REFERENCES collaborator(id_collaborator) ON DELETE RESTRICT
    `);
    logger.info("Migration: event_day_company_collaborator.id_substitute adicionada");
  }

  if (!(await indexExists(connection, "event_day_company_collaborator", "uk_edcc_access_id"))) {
    await connection.query(`
      ALTER TABLE event_day_company_collaborator
      ADD UNIQUE INDEX uk_edcc_access_id (access_id)
    `);
    logger.info("Migration: índice uk_edcc_access_id criado");
  }

  if (!(await indexExists(connection, "event_day_company_collaborator", "idx_edcc_check_in"))) {
    await connection.query(`
      ALTER TABLE event_day_company_collaborator
      ADD INDEX idx_edcc_check_in (access_check_in)
    `);
    logger.info("Migration: índice idx_edcc_check_in criado");
  }

  const [colType] = await connection.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'perfil' LIMIT 1`,
    [env.db.name],
  );
  const columnType = colType[0]?.COLUMN_TYPE || "";
  if (columnType && !columnType.includes("CONTROLADOR")) {
    await connection.query(`
      ALTER TABLE usuarios
      MODIFY COLUMN perfil ENUM('ADMIN', 'USER', 'PRODUTORA', 'PADRAO', 'CONTROLADOR') NOT NULL DEFAULT 'USER'
    `);
    logger.info("Migration: usuarios.perfil estendido com CONTROLADOR");
  }
}

async function migratePhase2(connection) {
  const [vehicleTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vehicle' LIMIT 1`,
    [env.db.name],
  );
  if (vehicleTables.length === 0) {
    await connection.query(`
      CREATE TABLE vehicle (
        id_vehicle INT AUTO_INCREMENT PRIMARY KEY,
        id_company INT NOT NULL,
        plate VARCHAR(8) NOT NULL,
        description VARCHAR(200) NULL,
        status TINYINT(1) NOT NULL DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_vehicle_company_plate (id_company, plate),
        INDEX idx_vehicle_company (id_company),
        INDEX idx_vehicle_status (status),
        FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE RESTRICT
      )
    `);
    logger.info("Migration: tabela vehicle criada");
  }

  const [saTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'service_access' LIMIT 1`,
    [env.db.name],
  );
  if (saTables.length === 0) {
    await connection.query(`
      CREATE TABLE service_access (
        id_service_access INT AUTO_INCREMENT PRIMARY KEY,
        id_company INT NOT NULL,
        id_access_status INT NOT NULL,
        service_type VARCHAR(120) NOT NULL,
        description VARCHAR(500) NULL,
        id_usuario INT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_service_access_company (id_company),
        INDEX idx_service_access_status (id_access_status),
        FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE RESTRICT,
        FOREIGN KEY (id_access_status) REFERENCES access_status(id_access_status) ON DELETE RESTRICT,
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE SET NULL
      )
    `);
    logger.info("Migration: tabela service_access criada");
  }

  const [sadTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'service_access_date' LIMIT 1`,
    [env.db.name],
  );
  if (sadTables.length === 0) {
    await connection.query(`
      CREATE TABLE service_access_date (
        id_service_access_date INT AUTO_INCREMENT PRIMARY KEY,
        id_service_access INT NOT NULL,
        access_date DATE NOT NULL,
        UNIQUE KEY uk_service_access_date (id_service_access, access_date),
        FOREIGN KEY (id_service_access) REFERENCES service_access(id_service_access) ON DELETE CASCADE
      )
    `);
    logger.info("Migration: tabela service_access_date criada");
  }

  const [savTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'service_access_vehicle' LIMIT 1`,
    [env.db.name],
  );
  if (savTables.length === 0) {
    await connection.query(`
      CREATE TABLE service_access_vehicle (
        id_service_access_vehicle INT AUTO_INCREMENT PRIMARY KEY,
        id_service_access INT NOT NULL,
        id_vehicle INT NOT NULL,
        access_id CHAR(36) NULL,
        id_substitute_vehicle INT NULL,
        check_in DATETIME NULL,
        check_out DATETIME NULL,
        UNIQUE KEY uk_service_access_vehicle_pair (id_service_access, id_vehicle),
        UNIQUE KEY uk_sav_access_id (access_id),
        INDEX idx_sav_service (id_service_access),
        FOREIGN KEY (id_service_access) REFERENCES service_access(id_service_access) ON DELETE CASCADE,
        FOREIGN KEY (id_vehicle) REFERENCES vehicle(id_vehicle) ON DELETE RESTRICT,
        FOREIGN KEY (id_substitute_vehicle) REFERENCES vehicle(id_vehicle) ON DELETE RESTRICT
      )
    `);
    logger.info("Migration: tabela service_access_vehicle criada");
  }

  if (!(await columnExists(connection, "collaborator", "picture"))) {
    await connection.query(`
      ALTER TABLE collaborator ADD COLUMN picture VARCHAR(255) NULL AFTER phone
    `);
    logger.info("Migration: collaborator.picture adicionada");
  }

  const [dcrTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'document_change_request' LIMIT 1`,
    [env.db.name],
  );
  if (dcrTables.length === 0) {
    await connection.query(`
      CREATE TABLE document_change_request (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_collaborator INT NOT NULL,
        id_collaborator_document_type INT NOT NULL,
        old_document VARCHAR(50) NOT NULL,
        new_document VARCHAR(50) NOT NULL,
        status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
        reason VARCHAR(500) NOT NULL,
        admin_reason VARCHAR(500) NULL,
        id_usuario_requester INT NULL,
        id_usuario_reviewer INT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_dcr_collaborator (id_collaborator),
        INDEX idx_dcr_status (status),
        FOREIGN KEY (id_collaborator) REFERENCES collaborator(id_collaborator) ON DELETE RESTRICT,
        FOREIGN KEY (id_collaborator_document_type) REFERENCES collaborator_document_type(id_collaborator_document_type) ON DELETE RESTRICT,
        FOREIGN KEY (id_usuario_requester) REFERENCES usuarios(id) ON DELETE SET NULL,
        FOREIGN KEY (id_usuario_reviewer) REFERENCES usuarios(id) ON DELETE SET NULL
      )
    `);
    logger.info("Migration: tabela document_change_request criada");
  }
}

async function migratePhase3(connection) {
  const [slTables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'storage_location' LIMIT 1`,
    [env.db.name],
  );
  if (slTables.length > 0) {
    logger.info("Migration Phase 3: já aplicada (storage_location existe)");
    return;
  }

  const sqlPath = path.join(__dirname, "../migrations/014_merchandise.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of statements) {
    await connection.query(statement);
  }
  logger.info("Migration Phase 3: 014_merchandise.sql aplicado");
}

async function migrateUsuariosCompanyLink(connection) {
  const [tables] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'company' LIMIT 1`,
    [env.db.name],
  );
  if (tables.length === 0) return;

  const [colType] = await connection.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'perfil' LIMIT 1`,
    [env.db.name],
  );
  const columnType = colType[0]?.COLUMN_TYPE || "";
  if (!columnType.includes("PRODUTORA")) {
    await connection.query(`
      ALTER TABLE usuarios
      MODIFY COLUMN perfil ENUM('ADMIN', 'USER', 'PRODUTORA', 'PADRAO') NOT NULL DEFAULT 'USER'
    `);
    logger.info("Migration: usuarios.perfil estendido com PRODUTORA e PADRAO");
  }

  if (!(await columnExists(connection, "usuarios", "id_company"))) {
    await connection.query(`
      ALTER TABLE usuarios
      ADD COLUMN id_company INT NULL AFTER departamento,
      ADD INDEX idx_usuarios_id_company (id_company),
      ADD CONSTRAINT fk_usuarios_company
        FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE SET NULL
    `);
    logger.info("Migration: usuarios.id_company adicionada");
  }
}

async function seedCompanyTypes(connection) {
  const expected = [
    [1, "Empresa Padrão"],
    [2, "Produtora"],
  ];

  const [rows] = await connection.query(
    "SELECT id_company_type, description FROM company_type ORDER BY id_company_type",
  );

  const matchesExpected =
    rows.length >= 2 &&
    rows.some((r) => r.id_company_type === 1 && r.description === "Empresa Padrão") &&
    rows.some((r) => r.id_company_type === 2 && r.description === "Produtora");

  if (!matchesExpected && rows.length > 0) {
    for (const row of rows) {
      await connection.query(
        "UPDATE company_type SET description = ? WHERE id_company_type = ?",
        [`__seed__${row.id_company_type}`, row.id_company_type],
      );
    }
  }

  for (const [id, description] of expected) {
    await connection.query(
      `INSERT INTO company_type (id_company_type, description) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      [id, description],
    );
  }

  await connection.query("DELETE FROM company_type WHERE description LIKE '__seed__%'");

  await connection.query(`
    DELETE ct FROM company_type ct
    LEFT JOIN company c ON c.id_company_type = ct.id_company_type
    WHERE ct.id_company_type NOT IN (1, 2) AND c.id_company IS NULL
  `);

  await connection.query("ALTER TABLE company_type AUTO_INCREMENT = 3");
}

async function seedDomainLookups(connection) {
  await seedCompanyTypes(connection);

  await connection.query(`
    INSERT INTO collaborator_document_type (description) VALUES
      ('CPF'),
      ('RG'),
      ('Passaporte')
    ON DUPLICATE KEY UPDATE description = VALUES(description)
  `);

  await connection.query(`
    INSERT INTO collaborator_role (description) VALUES
      ('Técnico de Som'),
      ('Limpeza'),
      ('Segurança'),
      ('Roadie')
    ON DUPLICATE KEY UPDATE description = VALUES(description)
  `);

  await connection.query(`
    INSERT INTO event_day_type (description) VALUES
      ('Montagem'),
      ('Show'),
      ('Desmontagem'),
      ('Jogo')
    ON DUPLICATE KEY UPDATE description = VALUES(description)
  `);

  await connection.query(`
    INSERT INTO access_status (id_access_status, description) VALUES
      (1, 'Aguardando Produtora'),
      (2, 'Aguardando Allianz'),
      (3, 'Aprovado'),
      (4, 'Negado')
    ON DUPLICATE KEY UPDATE description = VALUES(description)
  `);

  logger.info("Seeds de domínio (company_type, colaboradores, eventos, access_status) aplicados");
}

async function initializeDatabase() {
  logger.info("Verificando banco de dados Credenciamento...");
  let connection;

  try {
    connection = await mysql.createConnection({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      connectTimeout: env.db.connectTimeout,
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.db.name}\`;`);
    await connection.changeUser({ database: env.db.name });

    await connection.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        nome_completo VARCHAR(200) NOT NULL,
        email VARCHAR(200) NOT NULL UNIQUE,
        departamento VARCHAR(200) NULL,
        senha_hash VARCHAR(255) NULL,
        perfil ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
        microsoft_id VARCHAR(64) NULL UNIQUE,
        is_ad_user TINYINT(1) NOT NULL DEFAULT 0,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS azure_tenants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        azure_tenant_id VARCHAR(64) NOT NULL,
        client_id VARCHAR(64) NOT NULL,
        client_secret_ciphertext TEXT NULL,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        eh_principal TINYINT(1) NOT NULL DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_azure_tenant_id (azure_tenant_id)
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        client_type VARCHAR(20) NOT NULL DEFAULT 'web',
        device_info VARCHAR(500) NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token_hash (token_hash),
        INDEX idx_user_id (user_id),
        FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        action VARCHAR(50) NOT NULL,
        module VARCHAR(50) NOT NULL,
        ip VARCHAR(45) NULL,
        client_type VARCHAR(20) NULL,
        request_id VARCHAR(64) NULL,
        metadata JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_module_action (module, action),
        INDEX idx_created_at (created_at)
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS smtp_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        host VARCHAR(255) NOT NULL,
        port INT NOT NULL DEFAULT 587,
        secure TINYINT(1) NOT NULL DEFAULT 0,
        user VARCHAR(255) NOT NULL,
        password_ciphertext TEXT NULL,
        from_email VARCHAR(255) NOT NULL,
        from_name VARCHAR(100) NULL,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_idle_minutes INT NOT NULL DEFAULT 30,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    const [systemSettingsRows] = await connection.query(
      "SELECT id FROM system_settings LIMIT 1",
    );
    if (systemSettingsRows.length === 0) {
      await connection.query(
        "INSERT INTO system_settings (session_idle_minutes) VALUES (30)",
      );
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS smtp_send_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        destinatario VARCHAR(255) NOT NULL,
        assunto VARCHAR(500) NOT NULL,
        corpo_resumo VARCHAR(500) NULL,
        status ENUM('sent', 'failed') NOT NULL,
        erro_mensagem TEXT NULL,
        usuario_id INT NULL,
        request_id VARCHAR(64) NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_criado_em (criado_em),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS teams_integrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        tipo ENUM('user', 'channel') NOT NULL DEFAULT 'user',
        azure_tenant_ref_id INT NOT NULL,
        team_id VARCHAR(64) NULL,
        channel_id VARCHAR(128) NULL,
        destinatario_email VARCHAR(255) NULL,
        activity_web_url VARCHAR(500) NULL,
        teams_app_id VARCHAR(64) NULL,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_azure_tenant_ref (azure_tenant_ref_id),
        FOREIGN KEY (azure_tenant_ref_id) REFERENCES azure_tenants(id) ON DELETE RESTRICT
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS company_type (
        id_company_type INT AUTO_INCREMENT PRIMARY KEY,
        description VARCHAR(100) NOT NULL,
        UNIQUE KEY uk_company_type_description (description)
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS company (
        id_company INT AUTO_INCREMENT PRIMARY KEY,
        id_company_type INT NOT NULL,
        cnpj VARCHAR(14) NOT NULL,
        company_name VARCHAR(200) NOT NULL,
        fancy_name VARCHAR(200) NULL,
        status TINYINT(1) NOT NULL DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_company_cnpj (cnpj),
        INDEX idx_company_type (id_company_type),
        INDEX idx_company_status (status),
        FOREIGN KEY (id_company_type) REFERENCES company_type(id_company_type) ON DELETE RESTRICT
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS company_contact (
        id_company_contact INT AUTO_INCREMENT PRIMARY KEY,
        id_company INT NOT NULL,
        name VARCHAR(200) NOT NULL,
        department VARCHAR(100) NULL,
        phone VARCHAR(30) NULL,
        email VARCHAR(200) NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_company_contact_company (id_company),
        FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE CASCADE
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS app_error_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        level VARCHAR(10) NOT NULL DEFAULT 'error',
        module VARCHAR(50) NOT NULL,
        message VARCHAR(500) NOT NULL,
        status_code INT NULL,
        user_id INT NULL,
        ip VARCHAR(45) NULL,
        client_type VARCHAR(20) NULL,
        request_id VARCHAR(64) NULL,
        path VARCHAR(255) NULL,
        method VARCHAR(10) NULL,
        stack TEXT NULL,
        metadata JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_module (module),
        INDEX idx_status_code (status_code),
        INDEX idx_created_at (created_at),
        INDEX idx_request_id (request_id)
      );
    `);

    await migrateTeamsIntegrations(connection);
    await migrateCompanies(connection);
    await migrateCollaborators(connection);
    await migrateEvents(connection);
    await migrateCredentials(connection);
    await migrateGate(connection);
    await migratePhase2(connection);
    await migratePhase3(connection);
    await migrateUsuarios(connection);
    await seedDomainLookups(connection);

    if (env.adminEmail && env.adminPassword) {
      const [existing] = await connection.query(
        "SELECT id FROM usuarios WHERE email = ? LIMIT 1",
        [env.adminEmail],
      );
      if (existing.length === 0) {
        const hash = await bcrypt.hash(env.adminPassword, 10);
        const username = env.adminEmail.split("@")[0];
        await connection.query(
          `INSERT INTO usuarios (username, nome_completo, email, departamento, senha_hash, perfil, ativo, is_ad_user)
           VALUES (?, 'Administrador', ?, 'Administração', ?, 'ADMIN', 1, 0)`,
          [username, env.adminEmail, hash],
        );
        logger.info({ email: env.adminEmail }, "Usuário admin seed criado");
      }
    }

    logger.info("Banco de dados pronto.");
  } catch (err) {
    logger.fatal({ err }, "Erro ao inicializar banco");
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = initializeDatabase;
