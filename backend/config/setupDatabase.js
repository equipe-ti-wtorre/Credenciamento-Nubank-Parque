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

  await connection.query(`
    INSERT IGNORE INTO company_type (description) VALUES
      ('Produtora'),
      ('Empresa Padrão'),
      ('Fornecedor de TI')
  `);
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

  await connection.query(`
    INSERT IGNORE INTO collaborator_document_type (description) VALUES
      ('CPF'),
      ('RG'),
      ('Passaporte')
  `);

  await connection.query(`
    INSERT IGNORE INTO collaborator_role (description) VALUES
      ('Técnico de Som'),
      ('Limpeza'),
      ('Segurança'),
      ('Roadie')
  `);
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

  await connection.query(`
    INSERT IGNORE INTO event_day_type (description) VALUES
      ('Montagem'),
      ('Show'),
      ('Desmontagem'),
      ('Jogo')
  `);
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

  await connection.query(`
    INSERT IGNORE INTO access_status (id_access_status, description) VALUES
      (1, 'Aguardando Produtora'),
      (2, 'Aguardando Allianz'),
      (3, 'Aprovado'),
      (4, 'Negado')
  `);
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
      INSERT IGNORE INTO company_type (description) VALUES
        ('Produtora'),
        ('Empresa Padrão'),
        ('Fornecedor de TI');
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
    await migrateUsuarios(connection);

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
