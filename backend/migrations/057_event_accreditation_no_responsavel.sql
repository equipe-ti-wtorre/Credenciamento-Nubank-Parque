-- Credenciamento Eventos não tem empresa responsável.
SET @db := DATABASE();

SET @nullable := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db
     AND TABLE_NAME = 'event_accreditation'
     AND COLUMN_NAME = 'id_company_responsavel'
   LIMIT 1
);
SET @sql := IF(
  @nullable = 'NO',
  'ALTER TABLE event_accreditation MODIFY COLUMN id_company_responsavel INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
