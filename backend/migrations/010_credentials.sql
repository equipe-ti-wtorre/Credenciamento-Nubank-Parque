-- Módulo de credenciamento: status de acesso, credenciais e recusas

CREATE TABLE IF NOT EXISTS access_status (
  id_access_status INT AUTO_INCREMENT PRIMARY KEY,
  description VARCHAR(100) NOT NULL,
  UNIQUE KEY uk_access_status_description (description)
);

CREATE TABLE IF NOT EXISTS event_day_company_collaborator (
  id_event_day_company_collaborator INT AUTO_INCREMENT PRIMARY KEY,
  id_event_day_company INT NOT NULL,
  id_collaborator INT NOT NULL,
  id_access_status INT NOT NULL,
  id_collaborator_role INT NOT NULL,
  access_id CHAR(36) NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_edcc_event_day_company (id_event_day_company),
  INDEX idx_edcc_collaborator (id_collaborator),
  INDEX idx_edcc_access_status (id_access_status),
  FOREIGN KEY (id_event_day_company) REFERENCES event_day_company(id_event_day_company) ON DELETE RESTRICT,
  FOREIGN KEY (id_collaborator) REFERENCES collaborator(id_collaborator) ON DELETE RESTRICT,
  FOREIGN KEY (id_access_status) REFERENCES access_status(id_access_status) ON DELETE RESTRICT,
  FOREIGN KEY (id_collaborator_role) REFERENCES collaborator_role(id_collaborator_role) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS event_day_company_collaborator_denied (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_event_day_company_collaborator INT NOT NULL,
  id_access_status INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_edcc_denied_credential (id_event_day_company_collaborator),
  FOREIGN KEY (id_event_day_company_collaborator) REFERENCES event_day_company_collaborator(id_event_day_company_collaborator) ON DELETE CASCADE,
  FOREIGN KEY (id_access_status) REFERENCES access_status(id_access_status) ON DELETE RESTRICT
);

INSERT IGNORE INTO access_status (id_access_status, description) VALUES
  (1, 'Aguardando Produtora'),
  (2, 'Aguardando Aprovação'),
  (3, 'Aprovado'),
  (4, 'Negado');
