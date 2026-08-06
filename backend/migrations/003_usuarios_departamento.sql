-- Referência: coluna adicionada automaticamente em config/setupDatabase.js

ALTER TABLE usuarios
  ADD COLUMN departamento VARCHAR(200) NULL AFTER email;
