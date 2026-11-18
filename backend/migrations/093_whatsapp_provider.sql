-- Canal WhatsApp (gateway OpenWA): configuração singleton + log de envios.

CREATE TABLE IF NOT EXISTS whatsapp_provider_config (
  id INT PRIMARY KEY,
  provider VARCHAR(20) NOT NULL DEFAULT 'openwa',
  base_url VARCHAR(255) NULL,
  api_key_ciphertext TEXT NULL,
  session_id VARCHAR(100) NULL,
  default_country_code VARCHAR(4) NOT NULL DEFAULT '55',
  ativo TINYINT(1) NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO whatsapp_provider_config (id, provider, default_country_code, ativo)
VALUES (1, 'openwa', '55', 0)
ON DUPLICATE KEY UPDATE id = id;

CREATE TABLE IF NOT EXISTS whatsapp_send_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  destinatario VARCHAR(64) NOT NULL,
  chat_id VARCHAR(64) NULL,
  corpo_resumo VARCHAR(500) NULL,
  status ENUM('sent', 'failed') NOT NULL,
  erro_mensagem TEXT NULL,
  usuario_id INT NULL,
  request_id VARCHAR(64) NULL,
  message_id VARCHAR(128) NULL,
  provider VARCHAR(20) NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wa_logs_status (status),
  INDEX idx_wa_logs_criado_em (criado_em),
  INDEX idx_wa_logs_message_id (message_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);
