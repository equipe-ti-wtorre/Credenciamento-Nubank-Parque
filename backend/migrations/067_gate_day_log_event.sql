-- Histórico de ciclos de credencial de evento no mesmo day log da portaria.

ALTER TABLE gate_access_day_log
  MODIFY COLUMN kind ENUM('collaborator', 'vehicle', 'event') NOT NULL;

ALTER TABLE gate_access_day_log
  MODIFY COLUMN id_service_access INT NULL;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gate_access_day_log'
     AND COLUMN_NAME = 'id_event'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE gate_access_day_log ADD COLUMN id_event INT NULL AFTER id_service_access',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
