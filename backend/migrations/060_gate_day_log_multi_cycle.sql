-- Permite mais de um ciclo de entrada/saída no mesmo dia (reaprovação após saída).
-- O unique (kind, id_ref, access_date) impedia um segundo CHECK_IN sem sobrescrever o primeiro.

SET @db := DATABASE();

SET @uq_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db
     AND TABLE_NAME = 'gate_access_day_log'
     AND INDEX_NAME = 'uq_gate_day_log_ref_date'
);
SET @sql := IF(
  @uq_exists > 0,
  'ALTER TABLE gate_access_day_log DROP INDEX uq_gate_day_log_ref_date',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db
     AND TABLE_NAME = 'gate_access_day_log'
     AND INDEX_NAME = 'idx_gate_day_log_ref_date'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE gate_access_day_log ADD INDEX idx_gate_day_log_ref_date (kind, id_ref, access_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill: quem já saiu e foi aprovado de novo volta para Aguardando.
-- Sem metadata seletiva (ou sem lista aprovados) = aprovou todos.
-- Quem ficou de fora da nova decisão não entra no UPDATE.

UPDATE service_access_collaborator sac
INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
INNER JOIN (
  SELECT a.id, a.id_entidade, a.finalizado_em
    FROM aprovacoes a
   INNER JOIN (
     SELECT id_entidade, MAX(id) AS max_id
       FROM aprovacoes
      WHERE tipo_entidade = 'ACESSO_SERVICO' AND status = 'APROVADO'
      GROUP BY id_entidade
   ) latest ON latest.max_id = a.id
) ap ON ap.id_entidade = sac.id_service_access
LEFT JOIN aprovacao_decisoes ad
  ON ad.id_aprovacao = ap.id
 AND ad.decisao = 'APROVADO'
 AND ad.nivel = (
   SELECT MAX(ad2.nivel)
     FROM aprovacao_decisoes ad2
    WHERE ad2.id_aprovacao = ap.id
      AND ad2.decisao = 'APROVADO'
 )
SET sac.access_check_in = NULL,
    sac.access_check_out = NULL
WHERE sa.id_access_status = 3
  AND sac.access_check_in IS NOT NULL
  AND sac.access_check_out IS NOT NULL
  AND sac.access_check_out >= sac.access_check_in
  AND ap.finalizado_em > sac.access_check_out
  AND (
    ad.id IS NULL
    OR ad.metadata IS NULL
    OR JSON_EXTRACT(ad.metadata, '$.aprovadosColaboradores') IS NULL
    OR JSON_CONTAINS(
         JSON_EXTRACT(ad.metadata, '$.aprovadosColaboradores'),
         JSON_OBJECT('id', sac.id_service_access_collaborator)
       )
  );

UPDATE service_access_vehicle sav
INNER JOIN service_access sa ON sa.id_service_access = sav.id_service_access
INNER JOIN (
  SELECT a.id, a.id_entidade, a.finalizado_em
    FROM aprovacoes a
   INNER JOIN (
     SELECT id_entidade, MAX(id) AS max_id
       FROM aprovacoes
      WHERE tipo_entidade = 'ACESSO_SERVICO' AND status = 'APROVADO'
      GROUP BY id_entidade
   ) latest ON latest.max_id = a.id
) ap ON ap.id_entidade = sav.id_service_access
LEFT JOIN aprovacao_decisoes ad
  ON ad.id_aprovacao = ap.id
 AND ad.decisao = 'APROVADO'
 AND ad.nivel = (
   SELECT MAX(ad2.nivel)
     FROM aprovacao_decisoes ad2
    WHERE ad2.id_aprovacao = ap.id
      AND ad2.decisao = 'APROVADO'
 )
SET sav.check_in = NULL,
    sav.check_out = NULL
WHERE sa.id_access_status = 3
  AND sav.check_in IS NOT NULL
  AND sav.check_out IS NOT NULL
  AND sav.check_out >= sav.check_in
  AND ap.finalizado_em > sav.check_out
  AND (
    ad.id IS NULL
    OR ad.metadata IS NULL
    OR JSON_EXTRACT(ad.metadata, '$.aprovadosVeiculos') IS NULL
    OR JSON_CONTAINS(
         JSON_EXTRACT(ad.metadata, '$.aprovadosVeiculos'),
         JSON_OBJECT('id', sav.id_service_access_vehicle)
       )
  );
