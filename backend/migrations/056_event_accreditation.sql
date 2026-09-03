-- ============================================================================
-- 056_event_accreditation.sql
-- Credenciamento Eventos: tabelas próprias, pulseiras e tipo de aprovação.
-- Isolado de event / service_access para não aparecer na Portaria.
-- ============================================================================

ALTER TABLE setor_fluxos
  MODIFY COLUMN tipo_entidade ENUM('EVENTO','ACESSO_SERVICO','CREDENCIAMENTO_EVENTO') NOT NULL;

ALTER TABLE aprovacoes
  MODIFY COLUMN tipo_entidade ENUM('EVENTO','ACESSO_SERVICO','CREDENCIAMENTO_EVENTO') NOT NULL;

CREATE TABLE IF NOT EXISTS bracelet_type (
  id_bracelet_type INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  event_kind ENUM('SHOWDAY','JOGO','BOTH') NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_bracelet_type_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO bracelet_type (name, event_kind, ativo) VALUES
  ('Showday', 'SHOWDAY', 1),
  ('Serviço', 'SHOWDAY', 1),
  ('Serviço Mirante', 'SHOWDAY', 1),
  ('Backstage', 'SHOWDAY', 1),
  ('Técnica', 'SHOWDAY', 1),
  ('Serviço Premium', 'BOTH', 1),
  ('A&B', 'BOTH', 1),
  ('Área Comum', 'JOGO', 1),
  ('Circulação Livre', 'JOGO', 1),
  ('Acesso ao Campo', 'JOGO', 1);

CREATE TABLE IF NOT EXISTS event_accreditation (
  id_event_accreditation INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  event_kind ENUM('SHOWDAY','JOGO') NOT NULL,
  start DATE NOT NULL,
  end DATE NOT NULL,
  inscription_start DATETIME NOT NULL,
  inscription_end DATETIME NOT NULL,
  id_setor INT UNSIGNED NOT NULL,
  id_solicitante INT NOT NULL,
  id_company_responsavel INT NULL,
  id_access_status INT NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ea_dates (start, end),
  INDEX idx_ea_inscription (inscription_end),
  INDEX idx_ea_status (id_access_status),
  INDEX idx_ea_setor (id_setor),
  CONSTRAINT fk_ea_setor FOREIGN KEY (id_setor) REFERENCES setores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ea_solicitante FOREIGN KEY (id_solicitante) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ea_company FOREIGN KEY (id_company_responsavel) REFERENCES company(id_company) ON DELETE RESTRICT,
  CONSTRAINT fk_ea_status FOREIGN KEY (id_access_status) REFERENCES access_status(id_access_status) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_accreditation_company (
  id_event_accreditation_company INT AUTO_INCREMENT PRIMARY KEY,
  id_event_accreditation INT NOT NULL,
  id_company INT NOT NULL,
  indication_status ENUM('INDICACAO','AGUARDANDO_APROVACAO','APROVADO','NEGADO') NOT NULL DEFAULT 'INDICACAO',
  indicated_complete_at DATETIME NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_eac_accreditation_company (id_event_accreditation, id_company),
  INDEX idx_eac_company (id_company),
  INDEX idx_eac_status (indication_status),
  CONSTRAINT fk_eac_accreditation FOREIGN KEY (id_event_accreditation)
    REFERENCES event_accreditation(id_event_accreditation) ON DELETE CASCADE,
  CONSTRAINT fk_eac_company FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_accreditation_collaborator (
  id_event_accreditation_collaborator INT AUTO_INCREMENT PRIMARY KEY,
  id_event_accreditation_company INT NOT NULL,
  id_collaborator INT NOT NULL,
  id_collaborator_role INT NOT NULL,
  id_bracelet_type INT NOT NULL,
  id_access_status INT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_eacol_company_collaborator (id_event_accreditation_company, id_collaborator),
  INDEX idx_eacol_collaborator (id_collaborator),
  INDEX idx_eacol_status (id_access_status),
  CONSTRAINT fk_eacol_company FOREIGN KEY (id_event_accreditation_company)
    REFERENCES event_accreditation_company(id_event_accreditation_company) ON DELETE CASCADE,
  CONSTRAINT fk_eacol_collaborator FOREIGN KEY (id_collaborator)
    REFERENCES collaborator(id_collaborator) ON DELETE RESTRICT,
  CONSTRAINT fk_eacol_role FOREIGN KEY (id_collaborator_role)
    REFERENCES collaborator_role(id_collaborator_role) ON DELETE RESTRICT,
  CONSTRAINT fk_eacol_bracelet FOREIGN KEY (id_bracelet_type)
    REFERENCES bracelet_type(id_bracelet_type) ON DELETE RESTRICT,
  CONSTRAINT fk_eacol_status FOREIGN KEY (id_access_status)
    REFERENCES access_status(id_access_status) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO setor_fluxos (id_setor, tipo_entidade, niveis_exigidos, ativo)
SELECT sf.id_setor, 'CREDENCIAMENTO_EVENTO', sf.niveis_exigidos, sf.ativo
  FROM setor_fluxos sf
 WHERE sf.tipo_entidade = 'EVENTO'
   AND NOT EXISTS (
         SELECT 1 FROM setor_fluxos x
          WHERE x.id_setor = sf.id_setor
            AND x.tipo_entidade = 'CREDENCIAMENTO_EVENTO'
       );

INSERT IGNORE INTO perfil_permissoes (id_perfil, modulo, acao)
SELECT p.id, 'event_accreditation', a.acao
  FROM perfis p
  CROSS JOIN (
    SELECT 'view' AS acao UNION ALL SELECT 'create' UNION ALL SELECT 'edit'
  ) a
 WHERE p.codigo IN ('PRODUTORA', 'PADRAO', 'EMPRESA_GESTOR', 'EMPRESA_SOLICITANTE', 'ADMIN')
    OR p.is_super_admin = 1;
