-- Fase 3: controle de mercadorias e estoque

CREATE TABLE IF NOT EXISTS storage_location (
  id_storage_location INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  type ENUM('DEPOSITO', 'LOJA') NOT NULL DEFAULT 'DEPOSITO',
  status TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_storage_location_status (status),
  INDEX idx_storage_location_type (type)
);

CREATE TABLE IF NOT EXISTS product (
  id_product INT AUTO_INCREMENT PRIMARY KEY,
  description VARCHAR(200) NOT NULL,
  unit_measure VARCHAR(40) NOT NULL,
  manufacturer VARCHAR(120) NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_product_status (status)
);

CREATE TABLE IF NOT EXISTS material_movement (
  id_material_movement INT AUTO_INCREMENT PRIMARY KEY,
  movement_type ENUM('ENTRADA', 'SAIDA') NOT NULL,
  id_company INT NOT NULL,
  invoice_number VARCHAR(60) NOT NULL,
  id_collaborator INT NOT NULL,
  id_vehicle INT NOT NULL,
  photo VARCHAR(255) NULL,
  id_usuario INT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mm_type_date (movement_type, criado_em),
  INDEX idx_mm_company (id_company),
  INDEX idx_mm_collaborator (id_collaborator),
  INDEX idx_mm_criado (criado_em),
  FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE RESTRICT,
  FOREIGN KEY (id_collaborator) REFERENCES collaborator(id_collaborator) ON DELETE RESTRICT,
  FOREIGN KEY (id_vehicle) REFERENCES vehicle(id_vehicle) ON DELETE RESTRICT,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS material_movement_item (
  id_material_movement_item INT AUTO_INCREMENT PRIMARY KEY,
  id_material_movement INT NOT NULL,
  id_product INT NOT NULL,
  id_storage_location INT NOT NULL,
  quantity DECIMAL(12, 3) NOT NULL,
  INDEX idx_mmi_movement (id_material_movement),
  INDEX idx_mmi_product_location (id_product, id_storage_location),
  FOREIGN KEY (id_material_movement) REFERENCES material_movement(id_material_movement) ON DELETE CASCADE,
  FOREIGN KEY (id_product) REFERENCES product(id_product) ON DELETE RESTRICT,
  FOREIGN KEY (id_storage_location) REFERENCES storage_location(id_storage_location) ON DELETE RESTRICT
);
