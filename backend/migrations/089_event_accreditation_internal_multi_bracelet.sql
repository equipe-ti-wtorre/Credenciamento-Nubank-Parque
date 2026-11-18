-- ============================================================================
-- 089_event_accreditation_internal_multi_bracelet.sql
-- Permite mais de uma pulseira por usuário AD no mesmo credenciamento.
-- ============================================================================

ALTER TABLE event_accreditation_internal
  DROP INDEX uk_eai_accreditation_usuario,
  ADD UNIQUE KEY uk_eai_accreditation_usuario_bracelet
    (id_event_accreditation, id_usuario, id_bracelet_type);
