-- Horários de acesso de serviço: presets Comercial/Noturno em system_settings
-- e snapshot por acesso (Manual / Comercial / Noturno).

ALTER TABLE system_settings
  ADD COLUMN comercial_start TIME NOT NULL DEFAULT '08:00:00',
  ADD COLUMN comercial_end TIME NOT NULL DEFAULT '18:00:00',
  ADD COLUMN noturno_start TIME NOT NULL DEFAULT '18:00:00',
  ADD COLUMN noturno_end TIME NOT NULL DEFAULT '08:00:00';

ALTER TABLE service_access
  ADD COLUMN schedule_type ENUM('MANUAL', 'COMERCIAL', 'NOTURNO') NOT NULL DEFAULT 'MANUAL'
    AFTER end_date,
  ADD COLUMN schedule_start TIME NULL AFTER schedule_type,
  ADD COLUMN schedule_end TIME NULL AFTER schedule_start,
  ADD COLUMN schedule_crosses_midnight TINYINT(1) NOT NULL DEFAULT 0
    AFTER schedule_end;

INSERT IGNORE INTO perfil_permissoes (id_perfil, modulo, acao)
SELECT p.id, 'settings_access_schedule', a.acao
FROM perfis p
CROSS JOIN (
  SELECT 'view' AS acao UNION ALL SELECT 'create' UNION ALL SELECT 'edit' UNION ALL SELECT 'delete'
) a
WHERE p.codigo = 'ADMIN' OR p.is_super_admin = 1;
