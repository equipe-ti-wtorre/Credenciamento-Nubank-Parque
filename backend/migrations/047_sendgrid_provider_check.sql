ALTER TABLE email_provider_config
  DROP CONSTRAINT chk_email_provider;

ALTER TABLE email_provider_config
  ADD CONSTRAINT chk_email_provider CHECK (provider IN ('smtp', 'acs', 'sendgrid'));
