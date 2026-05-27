-- Fase 2: patrimonial, fotos de colaborador e mudança de documento

CREATE TABLE IF NOT EXISTS vehicle (
  id_vehicle INT AUTO_INCREMENT PRIMARY KEY,
  id_company INT NOT NULL,
  plate VARCHAR(8) NOT NULL,
  description VARCHAR(200) NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_vehicle_company_plate (id_company, plate),
  INDEX idx_vehicle_company (id_company),
  INDEX idx_vehicle_status (status),
  FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS service_access (
  id_service_access INT AUTO_INCREMENT PRIMARY KEY,
  id_company INT NOT NULL,
  id_access_status INT NOT NULL,
  service_type VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  id_usuario INT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_service_access_company (id_company),
  INDEX idx_service_access_status (id_access_status),
  FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE RESTRICT,
  FOREIGN KEY (id_access_status) REFERENCES access_status(id_access_status) ON DELETE RESTRICT,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS service_access_date (
  id_service_access_date INT AUTO_INCREMENT PRIMARY KEY,
  id_service_access INT NOT NULL,
  access_date DATE NOT NULL,
  UNIQUE KEY uk_service_access_date (id_service_access, access_date),
  FOREIGN KEY (id_service_access) REFERENCES service_access(id_service_access) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_access_vehicle (
  id_service_access_vehicle INT AUTO_INCREMENT PRIMARY KEY,
  id_service_access INT NOT NULL,
  id_vehicle INT NOT NULL,
  access_id CHAR(36) NULL,
  id_substitute_vehicle INT NULL,
  check_in DATETIME NULL,
  check_out DATETIME NULL,
  UNIQUE KEY uk_service_access_vehicle_pair (id_service_access, id_vehicle),
  UNIQUE KEY uk_sav_access_id (access_id),
  INDEX idx_sav_service (id_service_access),
  FOREIGN KEY (id_service_access) REFERENCES service_access(id_service_access) ON DELETE CASCADE,
  FOREIGN KEY (id_vehicle) REFERENCES vehicle(id_vehicle) ON DELETE RESTRICT,
  FOREIGN KEY (id_substitute_vehicle) REFERENCES vehicle(id_vehicle) ON DELETE RESTRICT
);

ALTER TABLE collaborator
  ADD COLUMN picture VARCHAR(255) NULL AFTER phone;

CREATE TABLE IF NOT EXISTS document_change_request (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_collaborator INT NOT NULL,
  id_collaborator_document_type INT NOT NULL,
  old_document VARCHAR(50) NOT NULL,
  new_document VARCHAR(50) NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  reason VARCHAR(500) NOT NULL,
  admin_reason VARCHAR(500) NULL,
  id_usuario_requester INT NULL,
  id_usuario_reviewer INT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dcr_collaborator (id_collaborator),
  INDEX idx_dcr_status (status),
  FOREIGN KEY (id_collaborator) REFERENCES collaborator(id_collaborator) ON DELETE RESTRICT,
  FOREIGN KEY (id_collaborator_document_type) REFERENCES collaborator_document_type(id_collaborator_document_type) ON DELETE RESTRICT,
  FOREIGN KEY (id_usuario_requester) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (id_usuario_reviewer) REFERENCES usuarios(id) ON DELETE SET NULL
);
