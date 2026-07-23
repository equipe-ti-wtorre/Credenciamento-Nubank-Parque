-- Persiste setor/solicitante sem criar aprovação no create;
-- log de "notificar término" por empresa parceira.
-- Idempotente: tolera colunas/índices/FKs já presentes.

SET @db := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'event' AND COLUMN_NAME = 'id_setor'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE event ADD COLUMN id_setor INT UNSIGNED NULL AFTER id_company_responsavel',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- usuarios.id é INT assinado — manter o mesmo tipo
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'event' AND COLUMN_NAME = 'id_solicitante'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE event ADD COLUMN id_solicitante INT NULL AFTER id_setor',
  'ALTER TABLE event MODIFY COLUMN id_solicitante INT NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'event' AND INDEX_NAME = 'idx_event_setor'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE event ADD INDEX idx_event_setor (id_setor)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'event' AND INDEX_NAME = 'idx_event_solicitante'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE event ADD INDEX idx_event_solicitante (id_solicitante)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'event'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_event_setor'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE event ADD CONSTRAINT fk_event_setor FOREIGN KEY (id_setor) REFERENCES setores(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'event'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_event_solicitante'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE event ADD CONSTRAINT fk_event_solicitante FOREIGN KEY (id_solicitante) REFERENCES usuarios(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE event e
  INNER JOIN (
    SELECT a.id_entidade, a.id_setor, a.id_solicitante
      FROM aprovacoes a
      INNER JOIN (
        SELECT id_entidade, MIN(id) AS min_id
          FROM aprovacoes
         WHERE tipo_entidade = 'EVENTO'
         GROUP BY id_entidade
      ) first_ap ON first_ap.min_id = a.id
     WHERE a.tipo_entidade = 'EVENTO'
  ) src ON src.id_entidade = e.id_event
   SET e.id_setor = COALESCE(e.id_setor, src.id_setor),
       e.id_solicitante = COALESCE(e.id_solicitante, src.id_solicitante)
 WHERE e.id_setor IS NULL OR e.id_solicitante IS NULL;

CREATE TABLE IF NOT EXISTS event_company_notify (
  id_event INT NOT NULL,
  id_company INT NOT NULL,
  notified_complete_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_usuario INT NULL,
  PRIMARY KEY (id_event, id_company),
  KEY ix_ecn_company (id_company),
  CONSTRAINT fk_ecn_event FOREIGN KEY (id_event) REFERENCES event(id_event) ON DELETE CASCADE,
  CONSTRAINT fk_ecn_company FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE CASCADE,
  CONSTRAINT fk_ecn_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
