-- Natureza (ESTOQUE/ENTREGA) e origem (CREDENCIADA/EVENTUAL) de movimentações.
-- Reentrante (MariaDB 10.11): IF EXISTS / IF NOT EXISTS. Ordem: colunas → FK → UPDATEs → CHECKs → índices.

-- 1) COLUNAS
ALTER TABLE material_movement
  MODIFY COLUMN IF EXISTS id_company INT NULL,
  MODIFY COLUMN IF EXISTS id_vehicle INT NULL,
  MODIFY COLUMN IF EXISTS id_collaborator INT NULL,
  MODIFY COLUMN IF EXISTS invoice_number VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS movement_nature ENUM('ESTOQUE','ENTREGA') NOT NULL DEFAULT 'ESTOQUE' AFTER movement_type,
  ADD COLUMN IF NOT EXISTS origin_type ENUM('CREDENCIADA','EVENTUAL') NOT NULL DEFAULT 'CREDENCIADA' AFTER movement_nature,
  ADD COLUMN IF NOT EXISTS sender_name       VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS sender_document   VARCHAR(20)  NULL,
  ADD COLUMN IF NOT EXISTS carrier_name      VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS driver_name       VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS driver_document   VARCHAR(20)  NULL,
  ADD COLUMN IF NOT EXISTS vehicle_plate     VARCHAR(10)  NULL,
  ADD COLUMN IF NOT EXISTS volumes             SMALLINT     NULL,
  ADD COLUMN IF NOT EXISTS content_description VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS id_recipient_collaborator INT NULL,
  ADD COLUMN IF NOT EXISTS recipient_area VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS no_invoice_reason
    ENUM('DECLARACAO_CONTEUDO','ENCOMENDA_PESSOAL','REMESSA_SEM_NOTA','OUTRO') NULL;

-- 2) FK do destinatário (idempotente)
ALTER TABLE material_movement DROP FOREIGN KEY IF EXISTS fk_mm_recipient;
ALTER TABLE material_movement
  ADD CONSTRAINT fk_mm_recipient FOREIGN KEY (id_recipient_collaborator)
      REFERENCES collaborator(id_collaborator) ON DELETE SET NULL;

-- 3) NORMALIZAÇÃO (antes dos CHECKs — eles validam as linhas existentes)
UPDATE material_movement
   SET invoice_number = NULL
 WHERE invoice_number IS NOT NULL
   AND TRIM(invoice_number) IN ('', '0', '-', 'SEM NF', 'S/N', 'SN');

UPDATE material_movement
   SET no_invoice_reason = 'OUTRO'
 WHERE invoice_number IS NULL AND no_invoice_reason IS NULL;

-- 4) CHECKs (drop antes para reentrância)
ALTER TABLE material_movement
  DROP CONSTRAINT IF EXISTS chk_mm_origem,
  DROP CONSTRAINT IF EXISTS chk_mm_natureza,
  DROP CONSTRAINT IF EXISTS chk_mm_nf;

ALTER TABLE material_movement
  ADD CONSTRAINT chk_mm_origem CHECK (
    (origin_type = 'CREDENCIADA' AND id_company IS NOT NULL AND id_vehicle IS NOT NULL)
    OR (origin_type = 'EVENTUAL' AND sender_name IS NOT NULL AND vehicle_plate IS NOT NULL)
  ),
  ADD CONSTRAINT chk_mm_natureza CHECK (
    (movement_nature = 'ENTREGA' AND volumes IS NOT NULL AND volumes > 0)
    OR movement_nature = 'ESTOQUE'
  ),
  ADD CONSTRAINT chk_mm_nf CHECK (
    invoice_number IS NOT NULL OR no_invoice_reason IS NOT NULL
  );

-- 5) ÍNDICES (014 já tem idx_mmi_product_location e idx_mm_type_date — não recriar)
ALTER TABLE material_movement
  ADD INDEX IF NOT EXISTS idx_mm_plate      (vehicle_plate, criado_em),
  ADD INDEX IF NOT EXISTS idx_mm_driver_doc (driver_document, criado_em),
  ADD INDEX IF NOT EXISTS idx_mm_sender_doc (sender_document),
  ADD INDEX IF NOT EXISTS idx_mm_nature     (movement_nature, movement_type, criado_em);
