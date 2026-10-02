const UF_BY_CODE = {
  11: "RO",
  12: "AC",
  13: "AM",
  14: "RR",
  15: "PA",
  16: "AP",
  17: "TO",
  21: "MA",
  22: "PI",
  23: "CE",
  24: "RN",
  25: "PB",
  26: "PE",
  27: "AL",
  28: "SE",
  29: "BA",
  31: "MG",
  32: "ES",
  33: "RJ",
  35: "SP",
  41: "PR",
  42: "SC",
  43: "RS",
  50: "MS",
  51: "MT",
  52: "GO",
  53: "DF",
};

function isValidNfeKey(key) {
  if (!/^\d{44}$/.test(key)) return false;
  const body = key.slice(0, 43);
  let sum = 0;
  let weight = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  const dv = rest === 0 || rest === 1 ? 0 : 11 - rest;
  return dv === Number(key[43]);
}

function extractKeyCandidates(text) {
  const flat = String(text || "").replace(/[^\d]/g, "");
  const out = new Set();
  for (let i = 0; i + 44 <= flat.length; i += 1) {
    const candidate = flat.slice(i, i + 44);
    if (isValidNfeKey(candidate)) out.add(candidate);
  }
  return [...out];
}

function parseNfeKey(key) {
  return {
    chave: key,
    cuf: key.slice(0, 2),
    competencia: `20${key.slice(2, 4)}-${key.slice(4, 6)}`,
    cnpj_emitente: key.slice(6, 20),
    modelo: key.slice(20, 22),
    serie: String(Number(key.slice(22, 25))),
    numero_nf: String(Number(key.slice(25, 34))),
    uf: UF_BY_CODE[key.slice(0, 2)] || null,
  };
}

module.exports = {
  extractKeyCandidates,
  isValidNfeKey,
  parseNfeKey,
  UF_BY_CODE,
};
