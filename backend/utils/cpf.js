function normalizeCpf(value) {
  if (value == null) return "";
  return String(value).replace(/\D/g, "").slice(0, 11);
}

function allSameDigits(cpf) {
  return /^(\d)\1+$/.test(cpf);
}

function calcDigit(cpf, factorStart) {
  let sum = 0;
  for (let i = 0; i < factorStart - 1; i += 1) {
    sum += Number(cpf[i]) * (factorStart - i);
  }
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

function isValidCpf(value) {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11) return false;
  if (allSameDigits(cpf)) return false;

  const d1 = calcDigit(cpf, 10);
  if (d1 !== Number(cpf[9])) return false;

  const d2 = calcDigit(cpf, 11);
  if (d2 !== Number(cpf[10])) return false;

  return true;
}

module.exports = {
  normalizeCpf,
  isValidCpf,
};
