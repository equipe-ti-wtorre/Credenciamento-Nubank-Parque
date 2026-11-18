-- Tokens de redefinição de senha para contas de empresa (uso único, 2 horas)

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_password_reset_token_hash (token_hash),
  INDEX idx_password_reset_usuario (id_usuario),
  INDEX idx_password_reset_expires (expires_at),
  CONSTRAINT fk_password_reset_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
);
