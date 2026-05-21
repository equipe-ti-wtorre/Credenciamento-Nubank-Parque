-- Erros da aplicação (também criada em config/setupDatabase.js)
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
