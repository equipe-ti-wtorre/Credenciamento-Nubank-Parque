CREATE TABLE IF NOT EXISTS facial_gateway_config (
  id INT PRIMARY KEY DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  events_secret_ciphertext TEXT NULL,
  commands_connection_string_ciphertext TEXT NULL,
  commands_queue VARCHAR(128) NOT NULL DEFAULT 'facial-commands',
  status_connection_string_ciphertext TEXT NULL,
  status_queue VARCHAR(128) NOT NULL DEFAULT 'facial-enrollment-status',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO facial_gateway_config (id, enabled)
VALUES (1, 0)
ON DUPLICATE KEY UPDATE id = id;
