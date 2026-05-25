-- Módulo de colaboradores: tipos de documento, funções, pessoas e blacklist

CREATE TABLE IF NOT EXISTS collaborator_document_type (
  id_collaborator_document_type INT AUTO_INCREMENT PRIMARY KEY,
  description VARCHAR(100) NOT NULL,
  UNIQUE KEY uk_collaborator_document_type_description (description)
);

CREATE TABLE IF NOT EXISTS collaborator_role (
  id_collaborator_role INT AUTO_INCREMENT PRIMARY KEY,
  description VARCHAR(100) NOT NULL,
  UNIQUE KEY uk_collaborator_role_description (description)
);

CREATE TABLE IF NOT EXISTS collaborator (
  id_collaborator INT AUTO_INCREMENT PRIMARY KEY,
  id_collaborator_document_type INT NOT NULL,
  id_collaborator_role INT NOT NULL,
  document VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  rg VARCHAR(30) NULL,
  phone VARCHAR(30) NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_collaborator_document (document, id_collaborator_document_type),
  INDEX idx_collaborator_document_type (id_collaborator_document_type),
  INDEX idx_collaborator_role (id_collaborator_role),
  INDEX idx_collaborator_status (status),
  INDEX idx_collaborator_name (name),
  FOREIGN KEY (id_collaborator_document_type) REFERENCES collaborator_document_type(id_collaborator_document_type) ON DELETE RESTRICT,
  FOREIGN KEY (id_collaborator_role) REFERENCES collaborator_role(id_collaborator_role) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS collaborator_black_list (
  id_collaborator INT NOT NULL PRIMARY KEY,
  reason VARCHAR(500) NOT NULL,
  id_usuario INT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_collaborator) REFERENCES collaborator(id_collaborator) ON DELETE CASCADE,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE SET NULL
);

INSERT IGNORE INTO collaborator_document_type (description) VALUES
  ('CPF'),
  ('RG'),
  ('Passaporte');

INSERT IGNORE INTO collaborator_role (description) VALUES
  ('Técnico de Som'),
  ('Limpeza'),
  ('Segurança'),
  ('Roadie');
