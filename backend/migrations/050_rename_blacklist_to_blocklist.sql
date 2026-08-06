-- Renomeia tabelas blacklist → blocklist (idempotente).

SET @db := DATABASE();

SET @old_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'collaborator_black_list'
);
SET @new_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'collaborator_block_list'
);
SET @sql := IF(
  @old_exists > 0 AND @new_exists = 0,
  'RENAME TABLE collaborator_black_list TO collaborator_block_list',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @old_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vehicle_black_list'
);
SET @new_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vehicle_block_list'
);
SET @sql := IF(
  @old_exists > 0 AND @new_exists = 0,
  'RENAME TABLE vehicle_black_list TO vehicle_block_list',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
