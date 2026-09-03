-- ============================================================================
-- 062_event_accreditation_internal.sql
-- Credenciamento interno para usuários AD: flag, pulseiras, inscrições,
-- trava de notificação e permissão de configuração.
-- ============================================================================

ALTER TABLE event_accreditation
  ADD COLUMN internal_enabled TINYINT(1) NOT NULL DEFAULT 0
    AFTER ativo,
  ADD INDEX idx_ea_internal (internal_enabled);

CREATE TABLE IF NOT EXISTS event_accreditation_internal_bracelet (
  id_event_accreditation_internal_bracelet INT AUTO_INCREMENT PRIMARY KEY,
  id_event_accreditation INT NOT NULL,
  id_bracelet_type INT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_eaib_accreditation_bracelet (id_event_accreditation, id_bracelet_type),
  INDEX idx_eaib_bracelet (id_bracelet_type),
  CONSTRAINT fk_eaib_accreditation FOREIGN KEY (id_event_accreditation)
    REFERENCES event_accreditation(id_event_accreditation) ON DELETE CASCADE,
  CONSTRAINT fk_eaib_bracelet FOREIGN KEY (id_bracelet_type)
    REFERENCES bracelet_type(id_bracelet_type) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_accreditation_internal (
  id_event_accreditation_internal INT AUTO_INCREMENT PRIMARY KEY,
  id_event_accreditation INT NOT NULL,
  id_usuario INT NOT NULL,
  id_bracelet_type INT NOT NULL,
  id_access_status INT NOT NULL,
  decided_by INT NULL,
  decided_at DATETIME NULL,
  decision_reason VARCHAR(240) NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_eai_accreditation_usuario (id_event_accreditation, id_usuario),
  INDEX idx_eai_usuario (id_usuario),
  INDEX idx_eai_status (id_access_status),
  INDEX idx_eai_decided_by (decided_by),
  CONSTRAINT fk_eai_accreditation FOREIGN KEY (id_event_accreditation)
    REFERENCES event_accreditation(id_event_accreditation) ON DELETE CASCADE,
  CONSTRAINT fk_eai_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_eai_bracelet FOREIGN KEY (id_bracelet_type)
    REFERENCES bracelet_type(id_bracelet_type) ON DELETE RESTRICT,
  CONSTRAINT fk_eai_status FOREIGN KEY (id_access_status)
    REFERENCES access_status(id_access_status) ON DELETE RESTRICT,
  CONSTRAINT fk_eai_decided_by FOREIGN KEY (decided_by)
    REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE system_settings
  ADD COLUMN ea_internal_notify_all TINYINT(1) NOT NULL DEFAULT 0
    AFTER color_palette;

CREATE TABLE IF NOT EXISTS event_accreditation_internal_notify_user (
  id_usuario INT NOT NULL PRIMARY KEY,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eainu_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE setor_fluxos
  MODIFY COLUMN tipo_entidade ENUM(
    'EVENTO',
    'ACESSO_SERVICO',
    'CREDENCIAMENTO_EVENTO',
    'CREDENCIAMENTO_EVENTO_INTERNO'
  ) NOT NULL;

ALTER TABLE aprovacoes
  MODIFY COLUMN tipo_entidade ENUM(
    'EVENTO',
    'ACESSO_SERVICO',
    'CREDENCIAMENTO_EVENTO',
    'CREDENCIAMENTO_EVENTO_INTERNO'
  ) NOT NULL;

INSERT INTO setor_fluxos (id_setor, tipo_entidade, niveis_exigidos, ativo)
SELECT sf.id_setor, 'CREDENCIAMENTO_EVENTO_INTERNO', sf.niveis_exigidos, sf.ativo
  FROM setor_fluxos sf
 WHERE sf.tipo_entidade = 'CREDENCIAMENTO_EVENTO'
   AND NOT EXISTS (
         SELECT 1 FROM setor_fluxos x
          WHERE x.id_setor = sf.id_setor
            AND x.tipo_entidade = 'CREDENCIAMENTO_EVENTO_INTERNO'
       );

INSERT IGNORE INTO perfil_permissoes (id_perfil, modulo, acao)
SELECT p.id, 'settings_event_accreditation', a.acao
  FROM perfis p
  CROSS JOIN (
    SELECT 'view' AS acao UNION ALL SELECT 'edit'
  ) a
 WHERE p.codigo = 'ADMIN' OR p.is_super_admin = 1;
