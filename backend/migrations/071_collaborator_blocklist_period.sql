-- ============================================================================
-- 071_collaborator_blocklist_period.sql
-- Período de bloqueio: permanente, por dias ou por quantidade de eventos.
-- ============================================================================

ALTER TABLE collaborator_block_list
  ADD COLUMN block_type ENUM('permanent', 'days', 'events') NOT NULL DEFAULT 'permanent'
    AFTER reason,
  ADD COLUMN block_value INT NULL AFTER block_type,
  ADD COLUMN blocked_until DATETIME NULL AFTER block_value;

UPDATE collaborator_block_list
   SET block_type = 'permanent',
       block_value = NULL,
       blocked_until = NULL
 WHERE block_type IS NULL OR block_type = '';
