-- Jobs de enroll/revoke para HTTP poll (Gateway claim).
-- rec_no no log de acesso para deduplicação complementar.

CREATE TABLE IF NOT EXISTS facial_enrollment_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  correlation_id VARCHAR(36) NOT NULL,
  id_collaborator INT NOT NULL,
  type ENUM('enroll', 'revoke') NOT NULL,
  status ENUM('queued', 'processing', 'synced', 'partial', 'pending', 'failed') NOT NULL DEFAULT 'queued',
  photo_filename VARCHAR(255) NULL,
  claimed_at DATETIME NULL,
  completed_at DATETIME NULL,
  error TEXT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_fej_correlation (correlation_id),
  INDEX idx_fej_status_created (status, criado_em, id),
  INDEX idx_fej_collaborator (id_collaborator),
  INDEX idx_fej_claimed (status, claimed_at),
  CONSTRAINT fk_fej_collaborator
    FOREIGN KEY (id_collaborator) REFERENCES collaborator(id_collaborator) ON DELETE CASCADE
);

ALTER TABLE facial_access_log
  ADD COLUMN rec_no BIGINT NULL AFTER device_id;

ALTER TABLE facial_access_log
  ADD INDEX idx_fal_device_rec (device_id, rec_no);
