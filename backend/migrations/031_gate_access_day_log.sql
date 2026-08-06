-- Histórico diário de check-in/check-out da portaria (acessos de serviço).
-- As colunas em service_access_collaborator/vehicle guardam só o estado do dia
-- corrente (sobrescritas a cada novo CHECK_IN). Esta tabela preserva todos os dias.
CREATE TABLE IF NOT EXISTS gate_access_day_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('collaborator', 'vehicle') NOT NULL,
  id_ref INT NOT NULL,
  id_service_access INT NOT NULL,
  access_id VARCHAR(64) NOT NULL,
  access_date DATE NOT NULL,
  check_in DATETIME NULL,
  check_out DATETIME NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gate_day_log_ref_date (kind, id_ref, access_date),
  INDEX idx_gate_day_log_service (id_service_access),
  INDEX idx_gate_day_log_date (access_date)
);
