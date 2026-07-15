-- Feed de alertas in-app por usuário (lido / não lido).
CREATE TABLE IF NOT EXISTS alertas (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  tipo VARCHAR(80) NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  mensagem VARCHAR(1000) NOT NULL,
  link VARCHAR(255) NULL,
  tipo_referencia VARCHAR(80) NULL,
  id_referencia BIGINT NULL,
  lida_em DATETIME NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alertas_usuario_criado (id_usuario, criado_em),
  INDEX idx_alertas_usuario_lida_criado (id_usuario, lida_em, criado_em),
  CONSTRAINT fk_alertas_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id) ON DELETE CASCADE
);
