-- ============================================================================
-- 076_company_self_register.sql
-- Tokens de auto cadastro de empresa (convite enviado pelo admin, sem company/user prévios).
-- ============================================================================

CREATE TABLE IF NOT EXISTS company_self_register_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_hash VARCHAR(64) NOT NULL,
  email VARCHAR(200) NOT NULL,
  name VARCHAR(200) NOT NULL,
  id_company_type INT NOT NULL,
  id_usuario_criador INT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  id_company INT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_csr_token_hash (token_hash),
  INDEX idx_csr_email (email),
  INDEX idx_csr_expires (expires_at),
  INDEX idx_csr_used (used_at),
  CONSTRAINT fk_csr_company_type
    FOREIGN KEY (id_company_type) REFERENCES company_type(id_company_type) ON DELETE RESTRICT,
  CONSTRAINT fk_csr_usuario_criador
    FOREIGN KEY (id_usuario_criador) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_csr_company
    FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
