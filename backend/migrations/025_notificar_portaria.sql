-- Preferência: receber alerta quando colaborador/veículo fizer check-in na portaria
ALTER TABLE usuarios
  ADD COLUMN notificar_portaria TINYINT(1) NOT NULL DEFAULT 0
  AFTER session_idle_minutes;
