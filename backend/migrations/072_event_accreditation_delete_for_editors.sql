-- ============================================================================
-- 072_event_accreditation_delete_for_editors.sql
-- Quem já edita credenciamento de eventos também pode excluir.
-- ============================================================================

INSERT IGNORE INTO perfil_permissoes (id_perfil, modulo, acao)
SELECT DISTINCT pp.id_perfil, 'event_accreditation', 'delete'
  FROM perfil_permissoes pp
 WHERE pp.modulo = 'event_accreditation'
   AND pp.acao IN ('edit', 'create');
