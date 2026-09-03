-- ============================================================================
-- 061_event_accreditation_decision.sql
-- Auditoria da decisão incremental (aprovar / bloquear) no detalhe.
-- ============================================================================

ALTER TABLE event_accreditation_collaborator
  ADD COLUMN decided_by INT NULL AFTER id_access_status,
  ADD COLUMN decided_at DATETIME NULL AFTER decided_by,
  ADD COLUMN decision_reason VARCHAR(240) NULL AFTER decided_at,
  ADD INDEX idx_eacol_decided_by (decided_by),
  ADD CONSTRAINT fk_eacol_decided_by
    FOREIGN KEY (decided_by) REFERENCES usuarios(id) ON DELETE SET NULL;
