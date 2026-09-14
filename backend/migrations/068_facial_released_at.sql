ALTER TABLE service_access_collaborator
  ADD COLUMN facial_released_at DATETIME NULL AFTER access_check_out;

ALTER TABLE event_day_company_collaborator
  ADD COLUMN facial_released_at DATETIME NULL AFTER access_check_out;
