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

CREATE TABLE IF NOT EXISTS teams_integrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  azure_tenant_ref_id INT NOT NULL,
  team_id VARCHAR(64) NOT NULL,
  channel_id VARCHAR(128) NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_azure_tenant_ref (azure_tenant_ref_id),
  FOREIGN KEY (azure_tenant_ref_id) REFERENCES azure_tenants(id) ON DELETE RESTRICT
);
