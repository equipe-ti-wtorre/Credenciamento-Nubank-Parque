-- Módulo de empresas: tipos, empresas, contatos e vínculo com usuários

CREATE TABLE IF NOT EXISTS company_type (
  id_company_type INT AUTO_INCREMENT PRIMARY KEY,
  description VARCHAR(100) NOT NULL,
  UNIQUE KEY uk_company_type_description (description)
);

CREATE TABLE IF NOT EXISTS company (
  id_company INT AUTO_INCREMENT PRIMARY KEY,
  id_company_type INT NOT NULL,
  cnpj VARCHAR(14) NOT NULL,
  company_name VARCHAR(200) NOT NULL,
  fancy_name VARCHAR(200) NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_company_cnpj (cnpj),
  INDEX idx_company_type (id_company_type),
  INDEX idx_company_status (status),
  FOREIGN KEY (id_company_type) REFERENCES company_type(id_company_type) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS company_contact (
  id_company_contact INT AUTO_INCREMENT PRIMARY KEY,
  id_company INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  department VARCHAR(100) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(200) NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_company_contact_company (id_company),
  FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE CASCADE
);

INSERT IGNORE INTO company_type (description) VALUES
  ('Produtora'),
  ('Empresa Padrão'),
  ('Fornecedor de TI');

-- id_company e perfis estendidos (aplicados também em setupDatabase.js em runtime)
-- ALTER TABLE usuarios ADD COLUMN id_company INT NULL ...
-- ALTER TABLE usuarios MODIFY perfil ENUM('ADMIN','USER','PRODUTORA','PADRAO') ...
