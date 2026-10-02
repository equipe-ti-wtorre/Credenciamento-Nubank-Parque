-- ============================================================================
-- 084_event_accreditation_photo_required.sql
-- Flag por credenciamento: exigir foto dos colaboradores antes de avisar
-- o responsável do evento.
-- ============================================================================

ALTER TABLE event_accreditation
  ADD COLUMN photo_required TINYINT(1) NOT NULL DEFAULT 0
    AFTER internal_enabled;
