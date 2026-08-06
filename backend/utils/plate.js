const PLATE_OLD = /^[A-Z]{3}[0-9]{4}$/;
const PLATE_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

function normalizePlate(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function isValidPlate(plate) {
  const p = normalizePlate(plate);
  return PLATE_OLD.test(p) || PLATE_MERCOSUL.test(p);
}

module.exports = { normalizePlate, isValidPlate };
