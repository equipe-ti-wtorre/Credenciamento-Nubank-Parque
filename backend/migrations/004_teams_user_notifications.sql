ALTER TABLE teams_integrations
  ADD COLUMN tipo ENUM('user', 'channel') NOT NULL DEFAULT 'user' AFTER nome,
  ADD COLUMN destinatario_email VARCHAR(255) NULL AFTER channel_id,
  MODIFY COLUMN team_id VARCHAR(64) NULL,
  MODIFY COLUMN channel_id VARCHAR(128) NULL;

UPDATE teams_integrations
SET tipo = 'channel'
WHERE team_id IS NOT NULL AND channel_id IS NOT NULL AND destinatario_email IS NULL;
