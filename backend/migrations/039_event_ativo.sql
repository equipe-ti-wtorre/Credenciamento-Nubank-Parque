-- Soft status: evento ativo/inativo (desativação pelo solicitante)

ALTER TABLE event
  ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1 AFTER id_company_responsavel,
  ADD INDEX idx_event_ativo (ativo);
