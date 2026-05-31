-- Capa do evento: descrição e produtora responsável

ALTER TABLE event
  ADD COLUMN description TEXT NULL AFTER end,
  ADD COLUMN id_producer INT NULL AFTER description,
  ADD INDEX idx_event_producer (id_producer),
  ADD CONSTRAINT fk_event_producer FOREIGN KEY (id_producer) REFERENCES company(id_company) ON DELETE RESTRICT;
