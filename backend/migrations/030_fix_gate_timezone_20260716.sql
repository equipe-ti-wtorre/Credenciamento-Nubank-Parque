-- Corrige registros de portaria gravados em 2026-07-16 enquanto o MySQL usava EDT (UTC-4).
-- A aplicação passa a usar -03:00 nas sessões MySQL e este ajuste cobre apenas os dados já gravados hoje.

UPDATE event_day_company_collaborator
SET access_check_in = DATE_ADD(access_check_in, INTERVAL 1 HOUR)
WHERE access_check_in >= '2026-07-16 00:00:00'
  AND access_check_in < '2026-07-17 00:00:00';

UPDATE event_day_company_collaborator
SET access_check_out = DATE_ADD(access_check_out, INTERVAL 1 HOUR)
WHERE access_check_out >= '2026-07-16 00:00:00'
  AND access_check_out < '2026-07-17 00:00:00';

UPDATE service_access_vehicle
SET check_in = DATE_ADD(check_in, INTERVAL 1 HOUR)
WHERE check_in >= '2026-07-16 00:00:00'
  AND check_in < '2026-07-17 00:00:00';

UPDATE service_access_vehicle
SET check_out = DATE_ADD(check_out, INTERVAL 1 HOUR)
WHERE check_out >= '2026-07-16 00:00:00'
  AND check_out < '2026-07-17 00:00:00';

UPDATE service_access_collaborator
SET access_check_in = DATE_ADD(access_check_in, INTERVAL 1 HOUR)
WHERE access_check_in >= '2026-07-16 00:00:00'
  AND access_check_in < '2026-07-17 00:00:00';

UPDATE service_access_collaborator
SET access_check_out = DATE_ADD(access_check_out, INTERVAL 1 HOUR)
WHERE access_check_out >= '2026-07-16 00:00:00'
  AND access_check_out < '2026-07-17 00:00:00';
