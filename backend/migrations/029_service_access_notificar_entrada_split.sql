-- Opt-in separado: notificação de entrada na portaria para colaborador e veículo.
-- Backfill a partir do flag legado notificar_entrada.

ALTER TABLE service_access
  ADD COLUMN notificar_entrada_colaborador TINYINT(1) NOT NULL DEFAULT 1
  AFTER notificar_entrada,
  ADD COLUMN notificar_entrada_veiculo TINYINT(1) NOT NULL DEFAULT 1
  AFTER notificar_entrada_colaborador;

UPDATE service_access
SET notificar_entrada_colaborador = notificar_entrada,
    notificar_entrada_veiculo = notificar_entrada;
