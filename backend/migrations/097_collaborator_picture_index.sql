-- Índice para conferir de quem é a foto em GET /storage/pictures (escopo de empresa)

CREATE INDEX idx_collaborator_picture ON collaborator (picture);
