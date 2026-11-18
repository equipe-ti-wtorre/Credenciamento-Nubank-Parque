-- ============================================================================
-- 090_setor_usuario_fluxos.sql
-- Acesso individual do participante aos fluxos de acesso de serviço,
-- credenciamento e credenciamento interno.
-- Quem já estava no time recebe os fluxos que o setor já tinha ativos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS setor_usuario_fluxos (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_setor_usuario  INT UNSIGNED NOT NULL,
  tipo_entidade     ENUM(
                      'ACESSO_SERVICO',
                      'CREDENCIAMENTO_EVENTO',
                      'CREDENCIAMENTO_EVENTO_INTERNO'
                    ) NOT NULL,
  ativo             TINYINT(1) NOT NULL DEFAULT 1,
  public_id         UUID NOT NULL DEFAULT (UUID()),
  criado_em         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_su_fluxo (id_setor_usuario, tipo_entidade),
  UNIQUE KEY uk_setor_usuario_fluxos_public_id (public_id),
  KEY ix_suf_tipo_ativo (tipo_entidade, ativo),
  CONSTRAINT fk_suf_setor_usuario
    FOREIGN KEY (id_setor_usuario) REFERENCES setor_usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO setor_usuario_fluxos (id_setor_usuario, tipo_entidade, ativo)
SELECT su.id, sf.tipo_entidade, 1
  FROM setor_usuarios su
  INNER JOIN setor_fluxos sf
    ON sf.id_setor = su.id_setor
   AND sf.ativo = 1
   AND sf.tipo_entidade IN (
     'ACESSO_SERVICO',
     'CREDENCIAMENTO_EVENTO',
     'CREDENCIAMENTO_EVENTO_INTERNO'
   )
 WHERE su.ativo = 1
ON DUPLICATE KEY UPDATE ativo = setor_usuario_fluxos.ativo;
