ALTER TABLE usuarios
  ADD COLUMN session_idle_minutes INT NULL DEFAULT NULL
  COMMENT 'NULL=padrao sistema, 0=desativado, 5-480=personalizado';
