-- ============================================================================
-- 070_event_accreditation_delete_permission.sql
-- Permissão de excluir credenciamento de eventos para admin.
-- ============================================================================

INSERT IGNORE INTO perfil_permissoes (id_perfil, modulo, acao)
SELECT p.id, 'event_accreditation', 'delete'
  FROM perfis p
 WHERE p.codigo = 'ADMIN'
    OR p.is_super_admin = 1;
