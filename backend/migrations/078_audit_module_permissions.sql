-- Permissão do módulo Auditoria (consulta e exportação) para ADMIN e super admin.

INSERT IGNORE INTO perfil_permissoes (id_perfil, modulo, acao)
SELECT p.id, 'audit', 'view'
FROM perfis p
WHERE p.codigo = 'ADMIN';

INSERT IGNORE INTO perfil_permissoes (id_perfil, modulo, acao)
SELECT p.id, 'audit', 'view'
FROM perfis p
WHERE p.is_super_admin = 1;
