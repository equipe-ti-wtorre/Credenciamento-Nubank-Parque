-- Garante permissões settings_facial para perfil ADMIN (INSERT IGNORE).

INSERT IGNORE INTO perfil_permissoes (id_perfil, modulo, acao)
SELECT p.id, 'settings_facial', 'view'
FROM perfis p
WHERE p.codigo = 'ADMIN';

INSERT IGNORE INTO perfil_permissoes (id_perfil, modulo, acao)
SELECT p.id, 'settings_facial', 'edit'
FROM perfis p
WHERE p.codigo = 'ADMIN';

INSERT IGNORE INTO perfil_permissoes (id_perfil, modulo, acao)
SELECT p.id, 'settings_facial', 'view'
FROM perfis p
WHERE p.is_super_admin = 1;

INSERT IGNORE INTO perfil_permissoes (id_perfil, modulo, acao)
SELECT p.id, 'settings_facial', 'edit'
FROM perfis p
WHERE p.is_super_admin = 1;
