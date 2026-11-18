-- ============================================================================
-- 086_company_origem.sql
-- Empresa cadastrada por uma produtora fica vinculada a ela.
-- Empresas sem origem continuam visíveis só para perfil interno.
-- ============================================================================

ALTER TABLE company
  ADD COLUMN id_company_origem INT NULL AFTER id_company_type,
  ADD KEY ix_company_origem (id_company_origem),
  ADD CONSTRAINT fk_company_origem
    FOREIGN KEY (id_company_origem) REFERENCES company(id_company) ON DELETE SET NULL;

UPDATE company c
INNER JOIN company_self_register_tokens t ON t.id_company = c.id_company
INNER JOIN usuarios u ON u.id = t.id_usuario_criador AND u.id_company IS NOT NULL
INNER JOIN company origem ON origem.id_company = u.id_company
INNER JOIN company_type ct ON ct.id_company_type = origem.id_company_type AND ct.description = 'Produtora'
SET c.id_company_origem = u.id_company
WHERE c.id_company_origem IS NULL
  AND u.id_company <> c.id_company;

UPDATE company c
INNER JOIN (
  SELECT
    CAST(JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.resource.id')) AS UNSIGNED) AS id_company,
    MIN(u.id_company) AS id_company_origem
  FROM audit_logs a
  INNER JOIN usuarios u ON u.id = a.user_id AND u.id_company IS NOT NULL
  INNER JOIN company origem ON origem.id_company = u.id_company
  INNER JOIN company_type ct ON ct.id_company_type = origem.id_company_type AND ct.description = 'Produtora'
  WHERE a.module = 'companies'
    AND a.action = 'CREATE'
    AND JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.event')) = 'companies.create'
    AND JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.resource.type')) = 'company'
  GROUP BY CAST(JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.resource.id')) AS UNSIGNED)
) src ON src.id_company = c.id_company
SET c.id_company_origem = src.id_company_origem
WHERE c.id_company_origem IS NULL
  AND src.id_company_origem IS NOT NULL
  AND src.id_company_origem <> c.id_company;
