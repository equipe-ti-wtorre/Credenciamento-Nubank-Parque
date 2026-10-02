-- Idempotência de lançamento de mercadorias (replay de submit duplicado).
-- Vários NULL são permitidos na UNIQUE (MariaDB/MySQL).

ALTER TABLE material_movement
  ADD COLUMN request_id CHAR(36) NULL AFTER id_usuario,
  ADD UNIQUE KEY uq_mm_request_id (request_id);
