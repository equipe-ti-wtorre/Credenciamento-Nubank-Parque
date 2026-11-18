-- public_id para inscrições internas de credenciamento (aprovação seletiva usa UUID na API).
ALTER TABLE event_accreditation_internal ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER id_event_accreditation_internal;
UPDATE event_accreditation_internal SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE event_accreditation_internal MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS uk_event_accreditation_internal_public_id ON event_accreditation_internal (public_id);
