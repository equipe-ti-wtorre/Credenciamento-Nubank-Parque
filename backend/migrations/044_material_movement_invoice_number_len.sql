-- Permite várias NFs no mesmo lançamento (números concatenados).
ALTER TABLE material_movement
  MODIFY COLUMN invoice_number VARCHAR(255) NOT NULL;
