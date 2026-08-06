-- Snapshot da aprovação seletiva (aprovados/bloqueados) nas decisões.
ALTER TABLE aprovacao_decisoes
  ADD COLUMN metadata JSON NULL AFTER comentario;
