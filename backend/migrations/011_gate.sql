-- Módulo de portaria: perfil CONTROLADOR e colunas de fluxo físico em credenciais

ALTER TABLE usuarios
  MODIFY COLUMN perfil ENUM('ADMIN', 'USER', 'PRODUTORA', 'PADRAO', 'CONTROLADOR') NOT NULL DEFAULT 'USER';

ALTER TABLE event_day_company_collaborator
  ADD COLUMN access_check_in DATETIME NULL AFTER access_id,
  ADD COLUMN access_check_out DATETIME NULL AFTER access_check_in,
  ADD COLUMN id_substitute INT NULL AFTER access_check_out,
  ADD UNIQUE INDEX uk_edcc_access_id (access_id),
  ADD INDEX idx_edcc_check_in (access_check_in),
  ADD CONSTRAINT fk_edcc_substitute
    FOREIGN KEY (id_substitute) REFERENCES collaborator(id_collaborator) ON DELETE RESTRICT;
