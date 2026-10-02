-- Remove solicitações e aprovações de correção de CPF/documento.

DELETE FROM alertas
 WHERE tipo IN ('document_change.requested', 'document_change.resolved')
    OR tipo_referencia = 'document_change_request';

DELETE FROM perfil_permissoes
 WHERE modulo = 'document_approvals';

DROP TABLE IF EXISTS document_change_request;
