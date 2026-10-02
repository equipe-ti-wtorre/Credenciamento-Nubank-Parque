-- Identidade deduplicável de remetentes eventuais (não mistura com company).
-- Reentrante (MariaDB 10.11): IF NOT EXISTS / IF EXISTS.

CREATE TABLE IF NOT EXISTS external_company (
  id_external_company INT AUTO_INCREMENT PRIMARY KEY,

  cnpj CHAR(14) NULL,
  cpf  CHAR(11) NULL,

  legal_name  VARCHAR(160) NOT NULL,
  trade_name  VARCHAR(160) NULL,
  ie          VARCHAR(20)  NULL,
  uf          CHAR(2)      NULL,
  municipio   VARCHAR(120) NULL,
  cep         CHAR(8)      NULL,
  endereco    VARCHAR(255) NULL,

  origem ENUM('OCR','MANUAL','CHAVE_ACESSO','IMPORT') NOT NULL DEFAULT 'OCR',
  revisado BOOLEAN NOT NULL DEFAULT 0,

  id_company INT NULL,

  primeira_entrada TIMESTAMP NULL,
  ultima_entrada   TIMESTAMP NULL,
  total_movimentos INT NOT NULL DEFAULT 0,

  criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_ext_cnpj (cnpj),
  UNIQUE KEY uq_ext_cpf  (cpf),
  KEY idx_ext_legal_name (legal_name),
  KEY idx_ext_ultima (ultima_entrada),
  CONSTRAINT fk_ext_company FOREIGN KEY (id_company)
    REFERENCES company(id_company) ON DELETE SET NULL
);

ALTER TABLE external_company DROP CONSTRAINT IF EXISTS chk_ext_doc;
ALTER TABLE external_company
  ADD CONSTRAINT chk_ext_doc CHECK (
    (cnpj IS NOT NULL AND cpf IS NULL) OR (cnpj IS NULL AND cpf IS NOT NULL)
  );

ALTER TABLE material_movement
  ADD COLUMN IF NOT EXISTS id_external_company INT NULL AFTER id_company;

ALTER TABLE material_movement DROP FOREIGN KEY IF EXISTS fk_mm_external_company;
ALTER TABLE material_movement
  ADD CONSTRAINT fk_mm_external_company
    FOREIGN KEY (id_external_company)
    REFERENCES external_company(id_external_company) ON DELETE SET NULL;

ALTER TABLE material_movement
  ADD INDEX IF NOT EXISTS idx_mm_external (id_external_company, criado_em);
