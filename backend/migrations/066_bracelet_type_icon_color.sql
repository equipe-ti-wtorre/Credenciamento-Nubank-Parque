-- ============================================================================
-- 066_bracelet_type_icon_color.sql
-- Ícone e cor selecionáveis em cada tipo de pulseira.
-- ============================================================================

ALTER TABLE bracelet_type
  ADD COLUMN icon VARCHAR(40) NOT NULL DEFAULT 'chevrons' AFTER event_kind,
  ADD COLUMN color CHAR(7) NOT NULL DEFAULT '#6B4C9A' AFTER icon;

UPDATE bracelet_type SET icon = 'music', color = '#8D0DE3' WHERE name = 'Showday';
UPDATE bracelet_type SET icon = 'chevrons', color = '#6B4C9A' WHERE name = 'Serviço';
UPDATE bracelet_type SET icon = 'binoculars', color = '#0F766E' WHERE name = 'Serviço Mirante';
UPDATE bracelet_type SET icon = 'mic', color = '#BE185D' WHERE name = 'Backstage';
UPDATE bracelet_type SET icon = 'wrench', color = '#B45309' WHERE name = 'Técnica';
UPDATE bracelet_type SET icon = 'star', color = '#7C3AED' WHERE name = 'Serviço Premium';
UPDATE bracelet_type SET icon = 'utensils', color = '#C2410C' WHERE name = 'A&B';
UPDATE bracelet_type SET icon = 'users', color = '#2563EB' WHERE name = 'Área Comum';
UPDATE bracelet_type SET icon = 'walk', color = '#15803D' WHERE name = 'Circulação Livre';
UPDATE bracelet_type SET icon = 'door', color = '#0E7490' WHERE name = 'Acesso ao Campo';
