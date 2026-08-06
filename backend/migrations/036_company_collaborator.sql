-- Vínculo N:N colaborador ↔ empresa (mesmo PF pode trabalhar para várias empresas)

CREATE TABLE IF NOT EXISTS company_collaborator (
  id_company INT NOT NULL,
  id_collaborator INT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_company, id_collaborator),
  INDEX idx_company_collaborator_collaborator (id_collaborator),
  CONSTRAINT fk_company_collaborator_company
    FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE CASCADE,
  CONSTRAINT fk_company_collaborator_collaborator
    FOREIGN KEY (id_collaborator) REFERENCES collaborator(id_collaborator) ON DELETE CASCADE
);

INSERT IGNORE INTO company_collaborator (id_company, id_collaborator)
SELECT id_company, id_collaborator
  FROM collaborator
 WHERE id_company IS NOT NULL;
