-- Relação de pessoas na movimentação de mercadorias (motorista + ajudantes)

CREATE TABLE IF NOT EXISTS material_movement_collaborator (
  id_material_movement_collaborator INT AUTO_INCREMENT PRIMARY KEY,
  id_material_movement INT NOT NULL,
  id_collaborator INT NOT NULL,
  role ENUM('MOTORISTA', 'AJUDANTE') NOT NULL DEFAULT 'AJUDANTE',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mmc_movement_collaborator (id_material_movement, id_collaborator),
  INDEX idx_mmc_collaborator (id_collaborator),
  INDEX idx_mmc_movement (id_material_movement),
  FOREIGN KEY (id_material_movement) REFERENCES material_movement(id_material_movement) ON DELETE CASCADE,
  FOREIGN KEY (id_collaborator) REFERENCES collaborator(id_collaborator) ON DELETE RESTRICT
);

-- Backfill: motorista já gravado em material_movement
INSERT INTO material_movement_collaborator (id_material_movement, id_collaborator, role)
SELECT mm.id_material_movement, mm.id_collaborator, 'MOTORISTA'
FROM material_movement mm
WHERE NOT EXISTS (
  SELECT 1
  FROM material_movement_collaborator mmc
  WHERE mmc.id_material_movement = mm.id_material_movement
    AND mmc.id_collaborator = mm.id_collaborator
);
