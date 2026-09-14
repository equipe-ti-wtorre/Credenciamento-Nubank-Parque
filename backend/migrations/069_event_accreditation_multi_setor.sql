-- ============================================================================
-- 069_event_accreditation_multi_setor.sql
-- Setores participantes do credenciamento, empresa vinculada a um setor
-- e log de notificações (convite / indicação / validação).
-- ============================================================================

SET @db := DATABASE();

CREATE TABLE IF NOT EXISTS event_accreditation_setor (
  id_event_accreditation INT NOT NULL,
  id_setor INT UNSIGNED NOT NULL,
  PRIMARY KEY (id_event_accreditation, id_setor),
  KEY ix_eas_setor (id_setor),
  CONSTRAINT fk_eas_accreditation FOREIGN KEY (id_event_accreditation)
    REFERENCES event_accreditation(id_event_accreditation) ON DELETE CASCADE,
  CONSTRAINT fk_eas_setor FOREIGN KEY (id_setor) REFERENCES setores(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO event_accreditation_setor (id_event_accreditation, id_setor)
SELECT id_event_accreditation, id_setor
  FROM event_accreditation
 WHERE id_setor IS NOT NULL;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db
     AND TABLE_NAME = 'event_accreditation_company'
     AND COLUMN_NAME = 'id_setor'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE event_accreditation_company ADD COLUMN id_setor INT UNSIGNED NULL AFTER id_company',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE event_accreditation_company eac
  INNER JOIN event_accreditation ea
    ON ea.id_event_accreditation = eac.id_event_accreditation
   SET eac.id_setor = ea.id_setor
 WHERE eac.id_setor IS NULL;

ALTER TABLE event_accreditation_company
  MODIFY COLUMN id_setor INT UNSIGNED NOT NULL;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db
     AND TABLE_NAME = 'event_accreditation_company'
     AND INDEX_NAME = 'idx_eac_setor'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE event_accreditation_company ADD INDEX idx_eac_setor (id_setor)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = @db
     AND TABLE_NAME = 'event_accreditation_company'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     AND CONSTRAINT_NAME = 'fk_eac_setor'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE event_accreditation_company ADD CONSTRAINT fk_eac_setor FOREIGN KEY (id_setor) REFERENCES setores(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS event_accreditation_notify_log (
  id_event_accreditation_notify_log INT AUTO_INCREMENT PRIMARY KEY,
  id_event_accreditation INT NOT NULL,
  id_event_accreditation_company INT NULL,
  id_setor INT UNSIGNED NULL,
  tipo ENUM('COMPANY_INVITE','SECTOR_INDICATION','OWNER_VALIDATED') NOT NULL,
  id_usuario INT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_eanl_ea (id_event_accreditation),
  KEY ix_eanl_tipo (tipo),
  CONSTRAINT fk_eanl_accreditation FOREIGN KEY (id_event_accreditation)
    REFERENCES event_accreditation(id_event_accreditation) ON DELETE CASCADE,
  CONSTRAINT fk_eanl_company FOREIGN KEY (id_event_accreditation_company)
    REFERENCES event_accreditation_company(id_event_accreditation_company) ON DELETE SET NULL,
  CONSTRAINT fk_eanl_setor FOREIGN KEY (id_setor) REFERENCES setores(id) ON DELETE SET NULL,
  CONSTRAINT fk_eanl_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
