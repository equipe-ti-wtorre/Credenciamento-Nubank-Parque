-- Evolução do módulo de Acessos de Serviço

ALTER TABLE service_access
  ADD COLUMN start_date DATE NULL AFTER id_usuario,
  ADD COLUMN end_date DATE NULL AFTER start_date,
  ADD COLUMN finalidade VARCHAR(200) NULL AFTER end_date,
  ADD COLUMN requesting_department VARCHAR(200) NULL AFTER finalidade,
  ADD COLUMN observacao VARCHAR(500) NULL AFTER requesting_department,
  ADD COLUMN status TINYINT(1) NOT NULL DEFAULT 1 AFTER observacao;

UPDATE service_access
SET finalidade = COALESCE(finalidade, service_type),
    observacao = COALESCE(observacao, description)
WHERE finalidade IS NULL OR (observacao IS NULL AND description IS NOT NULL);

UPDATE service_access sa
INNER JOIN (
  SELECT id_service_access, MIN(access_date) AS min_date, MAX(access_date) AS max_date
  FROM service_access_date
  GROUP BY id_service_access
) d ON d.id_service_access = sa.id_service_access
SET sa.start_date = COALESCE(sa.start_date, d.min_date),
    sa.end_date = COALESCE(sa.end_date, d.max_date);

UPDATE service_access
SET start_date = COALESCE(start_date, CURDATE()),
    end_date = COALESCE(end_date, CURDATE())
WHERE start_date IS NULL OR end_date IS NULL;

CREATE TABLE IF NOT EXISTS service_access_collaborator (
  id_service_access_collaborator INT AUTO_INCREMENT PRIMARY KEY,
  id_service_access INT NOT NULL,
  id_collaborator INT NOT NULL,
  id_collaborator_role INT NOT NULL,
  access_id CHAR(36) NULL,
  id_substitute INT NULL,
  access_check_in DATETIME NULL,
  access_check_out DATETIME NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_sac_pair (id_service_access, id_collaborator),
  UNIQUE KEY uk_sac_access_id (access_id),
  INDEX idx_sac_service (id_service_access),
  INDEX idx_sac_collaborator (id_collaborator),
  FOREIGN KEY (id_service_access) REFERENCES service_access(id_service_access) ON DELETE CASCADE,
  FOREIGN KEY (id_collaborator) REFERENCES collaborator(id_collaborator) ON DELETE RESTRICT,
  FOREIGN KEY (id_collaborator_role) REFERENCES collaborator_role(id_collaborator_role) ON DELETE RESTRICT,
  FOREIGN KEY (id_substitute) REFERENCES collaborator(id_collaborator) ON DELETE RESTRICT
);
