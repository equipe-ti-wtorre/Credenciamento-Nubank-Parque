-- Fotos anexadas à movimentação (NF / produto), persistidas no banco + arquivo em disco.
CREATE TABLE IF NOT EXISTS material_movement_photo (
  id_material_movement_photo INT AUTO_INCREMENT PRIMARY KEY,
  id_material_movement INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mmp_movement (id_material_movement),
  CONSTRAINT fk_mmp_movement
    FOREIGN KEY (id_material_movement) REFERENCES material_movement(id_material_movement)
    ON DELETE CASCADE
);
