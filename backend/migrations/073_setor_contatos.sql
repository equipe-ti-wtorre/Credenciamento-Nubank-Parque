-- ============================================================================
-- 073_setor_contatos.sql
-- Contatos operacionais do setor (nome, telefone, ramal, e-mail).
-- ============================================================================

CREATE TABLE IF NOT EXISTS setor_contatos (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_setor       INT UNSIGNED NOT NULL,
  nome           VARCHAR(200) NOT NULL,
  telefone       VARCHAR(30)  NULL,
  ramal          VARCHAR(20)  NULL,
  email          VARCHAR(200) NULL,
  criado_em      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_setor_contatos_setor (id_setor),
  CONSTRAINT fk_sc_setor FOREIGN KEY (id_setor) REFERENCES setores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
