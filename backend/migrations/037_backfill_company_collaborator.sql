-- Backfill: colaboradores já usados em acessos/credenciais passam a aparecer para a empresa

INSERT IGNORE INTO company_collaborator (id_company, id_collaborator)
SELECT DISTINCT sa.id_company, sac.id_collaborator
  FROM service_access_collaborator sac
 INNER JOIN service_access sa ON sa.id_service_access = sac.id_service_access
 WHERE sa.id_company IS NOT NULL;

INSERT IGNORE INTO company_collaborator (id_company, id_collaborator)
SELECT DISTINCT edc.id_company, edcc.id_collaborator
  FROM event_day_company_collaborator edcc
 INNER JOIN event_day_company edc ON edc.id_event_day_company = edcc.id_event_day_company
 WHERE edc.id_company IS NOT NULL;
