ALTER TABLE email_provider_config
  ADD COLUMN sendgrid_webhook_verification_key_ciphertext TEXT NULL
    AFTER sendgrid_from_name;
