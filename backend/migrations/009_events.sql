-- Módulo de eventos: casca, tipos de dia, dias e matriz empresa-dia (sem limite de cotas)

CREATE TABLE IF NOT EXISTS event (
  id_event INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  start DATE NOT NULL,
  end DATE NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_event_dates (start, end)
);

CREATE TABLE IF NOT EXISTS event_day_type (
  id_event_day_type INT AUTO_INCREMENT PRIMARY KEY,
  description VARCHAR(100) NOT NULL,
  UNIQUE KEY uk_event_day_type_description (description)
);

CREATE TABLE IF NOT EXISTS event_day (
  id_event_day INT AUTO_INCREMENT PRIMARY KEY,
  id_event INT NOT NULL,
  id_type INT NOT NULL,
  date DATE NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_day_event (id_event),
  INDEX idx_event_day_event_date (id_event, date),
  FOREIGN KEY (id_event) REFERENCES event(id_event) ON DELETE CASCADE,
  FOREIGN KEY (id_type) REFERENCES event_day_type(id_event_day_type) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS event_day_company (
  id_event_day_company INT AUTO_INCREMENT PRIMARY KEY,
  id_event_day INT NOT NULL,
  id_company INT NOT NULL,
  id_producer INT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_event_day_company_day_company (id_event_day, id_company),
  INDEX idx_event_day_company_day (id_event_day),
  INDEX idx_event_day_company_company (id_company),
  INDEX idx_event_day_company_producer (id_producer),
  FOREIGN KEY (id_event_day) REFERENCES event_day(id_event_day) ON DELETE CASCADE,
  FOREIGN KEY (id_company) REFERENCES company(id_company) ON DELETE RESTRICT,
  FOREIGN KEY (id_producer) REFERENCES company(id_company) ON DELETE RESTRICT
);

INSERT IGNORE INTO event_day_type (description) VALUES
  ('Montagem'),
  ('Show'),
  ('Desmontagem'),
  ('Jogo');
