-- Veículos vinculados à empresa no dia do evento (espelho enxuto de event_day_company_collaborator)
CREATE TABLE IF NOT EXISTS event_day_company_vehicle (
  id_event_day_company_vehicle INT AUTO_INCREMENT PRIMARY KEY,
  id_event_day_company INT NOT NULL,
  id_vehicle INT NOT NULL,
  id_access_status INT NOT NULL,
  access_id CHAR(36) NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_edcv_link_vehicle (id_event_day_company, id_vehicle),
  INDEX idx_edcv_event_day_company (id_event_day_company),
  INDEX idx_edcv_vehicle (id_vehicle),
  INDEX idx_edcv_access_status (id_access_status),
  CONSTRAINT fk_edcv_event_day_company
    FOREIGN KEY (id_event_day_company) REFERENCES event_day_company(id_event_day_company) ON DELETE RESTRICT,
  CONSTRAINT fk_edcv_vehicle
    FOREIGN KEY (id_vehicle) REFERENCES vehicle(id_vehicle) ON DELETE RESTRICT,
  CONSTRAINT fk_edcv_access_status
    FOREIGN KEY (id_access_status) REFERENCES access_status(id_access_status) ON DELETE RESTRICT
);
