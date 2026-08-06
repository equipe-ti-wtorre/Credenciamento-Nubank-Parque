-- Soft-delete de alertas (evita recriação pelo sync de inbox).
ALTER TABLE alertas
  ADD COLUMN excluido_em DATETIME NULL AFTER lida_em;

CREATE INDEX idx_alertas_usuario_excluido_criado
  ON alertas (id_usuario, excluido_em, criado_em);
