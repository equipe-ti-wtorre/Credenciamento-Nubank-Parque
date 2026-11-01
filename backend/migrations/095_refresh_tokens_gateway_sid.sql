ALTER TABLE refresh_tokens
  ADD COLUMN gateway_sid VARCHAR(64) NULL AFTER device_info,
  ADD INDEX idx_refresh_gateway_sid (gateway_sid);
