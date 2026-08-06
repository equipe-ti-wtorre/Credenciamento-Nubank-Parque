-- Preferência de alerta de portaria por evento (opt-in do usuário).
CREATE TABLE IF NOT EXISTS usuario_evento_preferencias (
  id_usuario INT NOT NULL,
  id_event INT NOT NULL,
  notificar_portaria TINYINT(1) NOT NULL DEFAULT 0,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_usuario, id_event),
  CONSTRAINT fk_uep_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_uep_event FOREIGN KEY (id_event) REFERENCES event(id_event) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
