ALTER TABLE email_provider_config
  MODIFY COLUMN provider VARCHAR(20) NOT NULL DEFAULT 'smtp',
  ADD COLUMN sendgrid_api_key_ciphertext TEXT NULL AFTER acs_sender,
  ADD COLUMN sendgrid_from_email VARCHAR(255) NULL AFTER sendgrid_api_key_ciphertext,
  ADD COLUMN sendgrid_from_name VARCHAR(100) NULL AFTER sendgrid_from_email;

ALTER TABLE smtp_send_logs
  MODIFY COLUMN provider VARCHAR(20) NULL;
