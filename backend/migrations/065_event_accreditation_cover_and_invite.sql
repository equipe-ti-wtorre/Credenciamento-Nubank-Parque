-- ============================================================================
-- 065_event_accreditation_cover_and_invite.sql
-- Capa do credenciamento e rascunho/agendamento do e-mail de convite.
-- ============================================================================

ALTER TABLE event_accreditation
  ADD COLUMN cover VARCHAR(255) NULL AFTER internal_enabled;

CREATE TABLE IF NOT EXISTS event_accreditation_invite (
  id_event_accreditation_invite INT AUTO_INCREMENT PRIMARY KEY,
  id_event_accreditation INT NOT NULL,
  subject VARCHAR(255) NOT NULL,
  html MEDIUMTEXT NOT NULL,
  send_at DATETIME NULL,
  sent_at DATETIME NULL,
  status ENUM('DRAFT', 'SCHEDULED', 'SENT', 'SKIPPED') NOT NULL DEFAULT 'DRAFT',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_eainv_accreditation (id_event_accreditation),
  INDEX idx_eainv_status_send (status, send_at),
  CONSTRAINT fk_eainv_accreditation FOREIGN KEY (id_event_accreditation)
    REFERENCES event_accreditation(id_event_accreditation) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_accreditation_invite_file (
  id_event_accreditation_invite_file INT AUTO_INCREMENT PRIMARY KEY,
  id_event_accreditation_invite INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime VARCHAR(120) NOT NULL,
  size_bytes INT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_eaif_invite (id_event_accreditation_invite),
  CONSTRAINT fk_eaif_invite FOREIGN KEY (id_event_accreditation_invite)
    REFERENCES event_accreditation_invite(id_event_accreditation_invite) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
