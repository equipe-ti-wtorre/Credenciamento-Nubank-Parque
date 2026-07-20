CREATE TABLE IF NOT EXISTS email_provider_config (
  id INT PRIMARY KEY,
  provider VARCHAR(10) NOT NULL DEFAULT 'smtp',
  acs_connection_string_ciphertext TEXT NULL,
  acs_sender VARCHAR(255) NULL,
  ocultar_para TINYINT(1) NOT NULL DEFAULT 0,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO email_provider_config (id, provider, ocultar_para, ativo)
VALUES (1, 'smtp', 0, 1)
ON DUPLICATE KEY UPDATE id = id;

ALTER TABLE smtp_send_logs
  ADD COLUMN message_id VARCHAR(128) NULL AFTER request_id,
  ADD COLUMN provider VARCHAR(10) NULL AFTER message_id,
  ADD INDEX idx_message_id (message_id);

ALTER TABLE smtp_send_logs
  MODIFY COLUMN status ENUM('sent', 'failed', 'entregue', 'bounce') NOT NULL;
