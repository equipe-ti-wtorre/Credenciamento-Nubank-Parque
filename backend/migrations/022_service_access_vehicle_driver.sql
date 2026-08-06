-- Motorista do veículo no contexto do acesso de serviço (nullable).
ALTER TABLE service_access_vehicle
  ADD COLUMN id_driver INT NULL AFTER id_vehicle,
  ADD CONSTRAINT fk_sav_driver
    FOREIGN KEY (id_driver) REFERENCES collaborator(id_collaborator) ON DELETE SET NULL;
