-- Saldo materializado de mercadorias (lock atômico em ENTRADA/SAIDA).
-- idx_mmi_product_location e idx_mm_type_date já existem em 014_merchandise.sql.

CREATE TABLE IF NOT EXISTS material_stock_balance (
  id_product INT NOT NULL,
  id_storage_location INT NOT NULL,
  balance DECIMAL(14, 3) NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_product, id_storage_location),
  FOREIGN KEY (id_product) REFERENCES product(id_product) ON DELETE RESTRICT,
  FOREIGN KEY (id_storage_location) REFERENCES storage_location(id_storage_location) ON DELETE RESTRICT
);

INSERT INTO material_stock_balance (id_product, id_storage_location, balance)
SELECT mmi.id_product,
       mmi.id_storage_location,
       SUM(CASE mm.movement_type WHEN 'ENTRADA' THEN mmi.quantity ELSE -mmi.quantity END)
FROM material_movement_item mmi
INNER JOIN material_movement mm ON mm.id_material_movement = mmi.id_material_movement
GROUP BY mmi.id_product, mmi.id_storage_location
ON DUPLICATE KEY UPDATE balance = VALUES(balance);
