CREATE TABLE IF NOT EXISTS email_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(64) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  descricao VARCHAR(500) NULL,
  assunto VARCHAR(500) NOT NULL,
  corpo_html MEDIUMTEXT NOT NULL,
  corpo_texto TEXT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by INT NULL,
  UNIQUE KEY uq_email_templates_codigo (codigo),
  KEY idx_email_templates_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
