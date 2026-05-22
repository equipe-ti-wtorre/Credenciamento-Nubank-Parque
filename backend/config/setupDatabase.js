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

    if (env.adminEmail && env.adminPassword) {
      const [existing] = await connection.query(
        "SELECT id FROM usuarios WHERE email = ? LIMIT 1",
        [env.adminEmail],
      );
      if (existing.length === 0) {
        const hash = await bcrypt.hash(env.adminPassword, 10);
        const username = env.adminEmail.split("@")[0];
        await connection.query(
          `INSERT INTO usuarios (username, nome_completo, email, senha_hash, perfil, ativo, is_ad_user)
           VALUES (?, 'Administrador', ?, ?, 'ADMIN', 1, 0)`,
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
