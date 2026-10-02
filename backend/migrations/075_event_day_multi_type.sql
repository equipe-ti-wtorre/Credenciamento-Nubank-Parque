-- ============================================================================
-- 075_event_day_multi_type.sql
-- Permite vários tipos (Montagem/Show/Desmontagem/Jogo) na mesma data.
-- ============================================================================

ALTER TABLE event_day
  ADD UNIQUE KEY uk_event_day_event_date_type (id_event, date, id_type);
