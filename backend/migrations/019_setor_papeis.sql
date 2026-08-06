-- ============================================================================
-- 019_setor_papeis.sql
-- Substitui nivel_aprovacao (0-9) por papel semântico no vínculo setor-usuário.
-- ============================================================================

ALTER TABLE setor_usuarios
  ADD COLUMN papel ENUM('SOLICITANTE','APROVADOR','GESTOR') NOT NULL DEFAULT 'SOLICITANTE'
  AFTER id_usuario;

UPDATE setor_usuarios SET papel = CASE
  WHEN nivel_aprovacao = 0 THEN 'SOLICITANTE'
  WHEN nivel_aprovacao = 1 THEN 'APROVADOR'
  ELSE 'GESTOR'
END;

ALTER TABLE setor_usuarios DROP CHECK ck_su_nivel;
ALTER TABLE setor_usuarios DROP INDEX ix_su_setor_nivel;
ALTER TABLE setor_usuarios DROP COLUMN nivel_aprovacao;

ALTER TABLE setor_usuarios ADD KEY ix_su_setor_papel (id_setor, ativo, papel);

UPDATE setor_fluxos SET niveis_exigidos = 1;

UPDATE aprovacoes
   SET niveis_exigidos = 1, nivel_atual = 1
 WHERE status = 'PENDENTE';
