-- Marca da sincronização incremental do diretório pelo auth-gateway (meta.serverTime da última rodada)

ALTER TABLE system_settings ADD COLUMN directory_sync_since VARCHAR(40) NULL;
