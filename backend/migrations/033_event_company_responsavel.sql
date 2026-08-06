-- Empresa responsável (Produtora) do evento

ALTER TABLE event
  ADD COLUMN id_company_responsavel INT NULL AFTER id_access_status,
  ADD INDEX idx_event_company_responsavel (id_company_responsavel),
  ADD CONSTRAINT fk_event_company_responsavel
    FOREIGN KEY (id_company_responsavel) REFERENCES company(id_company) ON DELETE RESTRICT;
