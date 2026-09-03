-- Enrollment facial + log de eventos de acesso (gateway).

ALTER TABLE collaborator
  ADD COLUMN facial_linked_id VARCHAR(64) NULL AFTER picture,
  ADD COLUMN facial_user_id VARCHAR(64) NULL AFTER facial_linked_id,
  ADD COLUMN facial_status ENUM('pending','synced','partial','failed','revoked') NULL AFTER facial_user_id,
  ADD COLUMN facial_last_correlation_id VARCHAR(36) NULL AFTER facial_status,
  ADD COLUMN facial_devices_json JSON NULL AFTER facial_last_correlation_id,
  ADD COLUMN facial_synced_at DATETIME NULL AFTER facial_devices_json;

CREATE TABLE IF NOT EXISTS facial_enrollment_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_collaborator INT NULL,
  correlation_id VARCHAR(36) NULL,
  direction ENUM('outbound','inbound') NOT NULL DEFAULT 'inbound',
  payload_json JSON NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fel_collaborator (id_collaborator),
  INDEX idx_fel_correlation (correlation_id),
  FOREIGN KEY (id_collaborator) REFERENCES collaborator(id_collaborator) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS facial_access_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gateway_event_id BIGINT NOT NULL,
  device_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  linked_id VARCHAR(64) NULL,
  event_time DATETIME NULL,
  antipassback TINYINT(1) NOT NULL DEFAULT 0,
  blocked TINYINT(1) NOT NULL DEFAULT 0,
  payload_json JSON NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_facial_access_gateway_event (gateway_event_id),
  INDEX idx_fal_user (user_id),
  INDEX idx_fal_device (device_id),
  INDEX idx_fal_event_time (event_time)
);
