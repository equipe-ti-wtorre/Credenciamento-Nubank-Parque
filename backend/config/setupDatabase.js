const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const env = require("./env");
const { logger } = require("./logger");

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
