-- ============================================================================
-- 085_perfil_setores.sql
-- Vínculo de time (setor) a um perfil de acesso.
-- As permissões do perfil são somadas às do perfil individual de cada membro.
-- ============================================================================

CREATE TABLE IF NOT EXISTS perfil_setores (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_perfil  INT UNSIGNED NOT NULL,
  id_setor   INT UNSIGNED NOT NULL,
  criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_perfil_setor (id_perfil, id_setor),
  KEY ix_perfil_setores_setor (id_setor),
  CONSTRAINT fk_perfil_setores_perfil FOREIGN KEY (id_perfil) REFERENCES perfis(id) ON DELETE CASCADE,
  CONSTRAINT fk_perfil_setores_setor FOREIGN KEY (id_setor) REFERENCES setores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
