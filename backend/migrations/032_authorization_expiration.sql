-- Status operacional e de workflow para solicitações cujo período
-- encerrou sem decisão de aprovação.

INSERT IGNORE INTO access_status (id_access_status, description) VALUES
  (5, 'Tempo de autorização expirada');

ALTER TABLE aprovacoes
  MODIFY COLUMN status ENUM(
    'PENDENTE',
    'APROVADO',
    'REPROVADO',
    'CANCELADO',
    'EXPIRADO'
  ) NOT NULL DEFAULT 'PENDENTE';
