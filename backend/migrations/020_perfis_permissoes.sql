CREATE TABLE IF NOT EXISTS perfis (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo          VARCHAR(50)   NOT NULL,
  nome            VARCHAR(100)  NOT NULL,
  descricao       VARCHAR(255)  NULL,
  is_system       TINYINT(1)    NOT NULL DEFAULT 0,
  is_super_admin  TINYINT(1)    NOT NULL DEFAULT 0,
  requires_company TINYINT(1)   NOT NULL DEFAULT 0,
  ativo           TINYINT(1)    NOT NULL DEFAULT 1,
  criado_em       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_perfis_codigo (codigo),
  KEY ix_perfis_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS perfil_permissoes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_perfil  INT UNSIGNED NOT NULL,
  modulo     VARCHAR(50)  NOT NULL,
  acao       VARCHAR(20)  NOT NULL,
  criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_perfil_modulo_acao (id_perfil, modulo, acao),
  KEY ix_pp_modulo (modulo),
  CONSTRAINT fk_pp_perfil FOREIGN KEY (id_perfil) REFERENCES perfis(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
