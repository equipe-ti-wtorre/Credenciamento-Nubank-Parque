-- Acesso de empresas: vínculo colaborador↔empresa e tokens de convite

ALTER TABLE collaborator
  ADD COLUMN id_company INT NULL AFTER phone,
  ADD INDEX idx_collaborator_company (id_company),
  ADD CONSTRAINT fk_collaborator_company
    FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS user_invite_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_invite_token_hash (token_hash),
  INDEX idx_user_invite_usuario (id_usuario),
  INDEX idx_user_invite_expires (expires_at),
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
);
