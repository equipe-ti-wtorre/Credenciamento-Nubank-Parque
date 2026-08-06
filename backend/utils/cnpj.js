function normalizeCnpj(value) {
  if (value == null) return "";
  return String(value).replace(/\D/g, "").slice(0, 14);
}

function allSameDigits(cnpj) {
  return /^(\d)\1+$/.test(cnpj);
}

function calcDigit(cnpj, weights) {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += Number(cnpj[i]) * weights[i];
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function isValidCnpj(value) {
  const cnpj = normalizeCnpj(value);
  if (cnpj.length !== 14) return false;
  if (allSameDigits(cnpj)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calcDigit(cnpj, weights1);
  if (d1 !== Number(cnpj[12])) return false;

  const d2 = calcDigit(cnpj, weights2);
  if (d2 !== Number(cnpj[13])) return false;

  return true;
}

module.exports = {
  normalizeCnpj,
  isValidCnpj,
};
