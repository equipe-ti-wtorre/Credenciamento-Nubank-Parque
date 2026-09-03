-- ============================================================================
-- 059_event_accreditation_bracelet.sql
-- Pulseiras habilitadas por credenciamento de evento.
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_accreditation_bracelet (
  id_event_accreditation_bracelet INT AUTO_INCREMENT PRIMARY KEY,
  id_event_accreditation INT NOT NULL,
  id_bracelet_type INT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_eab_accreditation_bracelet (id_event_accreditation, id_bracelet_type),
  INDEX idx_eab_bracelet (id_bracelet_type),
  CONSTRAINT fk_eab_accreditation FOREIGN KEY (id_event_accreditation)
    REFERENCES event_accreditation(id_event_accreditation) ON DELETE CASCADE,
  CONSTRAINT fk_eab_bracelet FOREIGN KEY (id_bracelet_type)
    REFERENCES bracelet_type(id_bracelet_type) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO event_accreditation_bracelet (id_event_accreditation, id_bracelet_type)
SELECT ea.id_event_accreditation, bt.id_bracelet_type
  FROM event_accreditation ea
  INNER JOIN bracelet_type bt
    ON bt.ativo = 1
   AND (bt.event_kind = 'BOTH' OR bt.event_kind = ea.event_kind);
