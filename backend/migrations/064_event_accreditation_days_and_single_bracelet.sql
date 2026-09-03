-- ============================================================================
-- 064_event_accreditation_days_and_single_bracelet.sql
-- Uma pulseira por usuário AD e vários dias de evento.
-- ============================================================================

DELETE eai
  FROM event_accreditation_internal eai
  INNER JOIN (
    SELECT id_event_accreditation, id_usuario, MIN(id_event_accreditation_internal) AS keep_id
      FROM event_accreditation_internal
     GROUP BY id_event_accreditation, id_usuario
    HAVING COUNT(*) > 1
  ) d
    ON d.id_event_accreditation = eai.id_event_accreditation
   AND d.id_usuario = eai.id_usuario
   AND eai.id_event_accreditation_internal <> d.keep_id;

ALTER TABLE event_accreditation_internal
  DROP INDEX uk_eai_accreditation_usuario_bracelet,
  ADD UNIQUE KEY uk_eai_accreditation_usuario (id_event_accreditation, id_usuario);

CREATE TABLE IF NOT EXISTS event_accreditation_day (
  id_event_accreditation_day INT AUTO_INCREMENT PRIMARY KEY,
  id_event_accreditation INT NOT NULL,
  day DATE NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ead_accreditation_day (id_event_accreditation, day),
  INDEX idx_ead_day (day),
  CONSTRAINT fk_ead_accreditation FOREIGN KEY (id_event_accreditation)
    REFERENCES event_accreditation(id_event_accreditation) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO event_accreditation_day (id_event_accreditation, day)
SELECT id_event_accreditation, start
  FROM event_accreditation
 WHERE start IS NOT NULL;
