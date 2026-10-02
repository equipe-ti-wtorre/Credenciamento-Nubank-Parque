-- Capa do evento (mesmo padrão de event_accreditation.cover).

ALTER TABLE event
  ADD COLUMN cover VARCHAR(255) NULL AFTER id_solicitante;
