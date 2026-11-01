ALTER TABLE facial_devices ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER id;
UPDATE facial_devices SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE facial_devices MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS uk_facial_devices_public_id ON facial_devices (public_id);
