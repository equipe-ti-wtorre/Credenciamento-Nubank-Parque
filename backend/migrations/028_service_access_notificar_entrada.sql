-- Notificação de entrada na portaria (acesso de serviço inteiro).
-- 1 = notifica solicitante/aprovadores no CHECK_IN; 0 = não notifica.

ALTER TABLE service_access
  ADD COLUMN notificar_entrada TINYINT(1) NOT NULL DEFAULT 1
  AFTER observacao;
