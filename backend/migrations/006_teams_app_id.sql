ALTER TABLE teams_integrations
  ADD COLUMN teams_app_id VARCHAR(64) NULL AFTER activity_web_url;
