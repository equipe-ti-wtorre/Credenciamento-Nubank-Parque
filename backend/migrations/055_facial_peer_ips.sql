ALTER TABLE facial_gateway_config
  ADD COLUMN peer_origin_ip VARCHAR(512) NULL AFTER status_queue,
  ADD COLUMN peer_destination_ip VARCHAR(512) NULL AFTER peer_origin_ip;
