CREATE TABLE IF NOT EXISTS vehicle_black_list (
  id_vehicle INT NOT NULL PRIMARY KEY,
  reason VARCHAR(500) NOT NULL,
  id_usuario INT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_vehicle) REFERENCES vehicle(id_vehicle) ON DELETE CASCADE,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE SET NULL
);
