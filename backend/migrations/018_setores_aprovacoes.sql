-- ============================================================================
-- 018_setores_aprovacoes.sql
-- Setores, vínculo usuário-setor com nível de aprovação e workflow genérico
-- de aprovações (EVENTO, ACESSO_SERVICO, extensível a outros tipos).
-- ============================================================================

CREATE TABLE IF NOT EXISTS setores (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome           VARCHAR(100)  NOT NULL,
  descricao      VARCHAR(255)  NULL,
  ativo          TINYINT(1)    NOT NULL DEFAULT 1,
  criado_por     INT           NULL,
  criado_em      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_setores_nome (nome),
  KEY ix_setores_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS setor_usuarios (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_setor         INT UNSIGNED     NOT NULL,
  id_usuario       INT              NOT NULL,
  nivel_aprovacao  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ativo            TINYINT(1)       NOT NULL DEFAULT 1,
  criado_em        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_setor_usuario (id_setor, id_usuario),
  KEY ix_su_usuario (id_usuario, ativo),
  KEY ix_su_setor_nivel (id_setor, ativo, nivel_aprovacao),
  CONSTRAINT fk_su_setor   FOREIGN KEY (id_setor)   REFERENCES setores(id),
  CONSTRAINT fk_su_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id),
  CONSTRAINT ck_su_nivel CHECK (nivel_aprovacao BETWEEN 0 AND 9)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS setor_fluxos (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_setor         INT UNSIGNED NOT NULL,
  tipo_entidade    ENUM('EVENTO','ACESSO_SERVICO') NOT NULL,
  niveis_exigidos  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  ativo            TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_setor_tipo (id_setor, tipo_entidade),
  KEY ix_sf_tipo_ativo (tipo_entidade, ativo),
  CONSTRAINT fk_sf_setor FOREIGN KEY (id_setor) REFERENCES setores(id),
  CONSTRAINT ck_sf_niveis CHECK (niveis_exigidos BETWEEN 1 AND 9)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aprovacoes (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo_entidade   ENUM('EVENTO','ACESSO_SERVICO') NOT NULL,
  id_entidade     INT UNSIGNED     NOT NULL,
  id_setor        INT UNSIGNED     NOT NULL,
  id_solicitante  INT              NOT NULL,
  nivel_atual     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  niveis_exigidos TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status          ENUM('PENDENTE','APROVADO','REPROVADO','CANCELADO')
                  NOT NULL DEFAULT 'PENDENTE',
  pendente_flag   TINYINT AS (IF(status = 'PENDENTE', 1, NULL)) STORED,
  criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalizado_em   DATETIME NULL,
  UNIQUE KEY uq_ap_pendente_por_entidade (tipo_entidade, id_entidade, pendente_flag),
  KEY ix_ap_inbox (status, id_setor, nivel_atual),
  KEY ix_ap_solicitante (id_solicitante, status),
  KEY ix_ap_entidade (tipo_entidade, id_entidade),
  CONSTRAINT fk_ap_setor        FOREIGN KEY (id_setor)       REFERENCES setores(id),
  CONSTRAINT fk_ap_solicitante  FOREIGN KEY (id_solicitante) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aprovacao_decisoes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_aprovacao  INT UNSIGNED     NOT NULL,
  nivel         TINYINT UNSIGNED NOT NULL,
  id_usuario    INT              NOT NULL,
  decisao       ENUM('APROVADO','REPROVADO') NOT NULL,
  comentario    VARCHAR(500) NULL,
  decidido_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ad_nivel (id_aprovacao, nivel),
  KEY ix_ad_usuario (id_usuario),
  CONSTRAINT fk_ad_aprovacao FOREIGN KEY (id_aprovacao) REFERENCES aprovacoes(id),
  CONSTRAINT fk_ad_usuario   FOREIGN KEY (id_usuario)   REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE usuarios
  MODIFY perfil ENUM('ADMIN','USER','PRODUTORA','PADRAO','CONTROLADOR','GESTAO')
  NOT NULL DEFAULT 'USER';

ALTER TABLE event
  ADD COLUMN id_access_status INT NULL AFTER end;

UPDATE event SET id_access_status = 3 WHERE id_access_status IS NULL;

ALTER TABLE event
  MODIFY COLUMN id_access_status INT NOT NULL DEFAULT 2,
  ADD INDEX idx_event_access_status (id_access_status),
  ADD CONSTRAINT fk_event_access_status
    FOREIGN KEY (id_access_status) REFERENCES access_status(id_access_status);

INSERT INTO setores (nome, descricao) VALUES
  ('T.I.',        'Tecnologia da Informação'),
  ('R.H.',        'Recursos Humanos'),
  ('Suprimentos', 'Compras e Suprimentos'),
  ('Operações',   'Operações da arena')
ON DUPLICATE KEY UPDATE descricao = VALUES(descricao);
