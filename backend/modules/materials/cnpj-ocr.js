const { isValidCnpj, normalizeCnpj } = require("../../utils/cnpj");
const { isValidCpf, normalizeCpf } = require("../../utils/cpf");

const OCR_MAP = {
  O: "0",
  o: "0",
  D: "0",
  Q: "0",
  I: "1",
  l: "1",
  "|": "1",
  i: "1",
  Z: "2",
  S: "5",
  s: "5",
  B: "8",
  G: "6",
  T: "7",
  A: "4",
  g: "9",
  q: "9",
};

function repairCnpj(raw) {
  const normalized = String(raw || "")
    .split("")
    .map((ch) => OCR_MAP[ch] ?? ch)
    .join("")
    .replace(/\D/g, "");

  if (normalized.length !== 14) return null;
  if (isValidCnpj(normalized)) return { cnpj: normalizeCnpj(normalized), reparado: false };

  const hits = [];
  for (let i = 0; i < 12; i += 1) {
    for (let d = 0; d <= 9; d += 1) {
      if (String(d) === normalized[i]) continue;
      const attempt = normalized.slice(0, i) + d + normalized.slice(i + 1);
      if (isValidCnpj(attempt)) hits.push(normalizeCnpj(attempt));
    }
  }
  return hits.length === 1 ? { cnpj: hits[0], reparado: true } : null;
}

function extractCnpjs(text) {
  const re = /(\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/g;
  const out = new Set();
  for (const m of String(text || "").matchAll(re)) {
    const r = repairCnpj(m[1]);
    if (r) out.add(r.cnpj);
  }
  return [...out];
}

function repairCpf(raw) {
  const normalized = String(raw || "")
    .split("")
    .map((ch) => OCR_MAP[ch] ?? ch)
    .join("")
    .replace(/\D/g, "");
  if (normalized.length !== 11) return null;
  if (isValidCpf(normalized)) return { cpf: normalizeCpf(normalized), reparado: false };

  const hits = [];
  for (let i = 0; i < 9; i += 1) {
    for (let d = 0; d <= 9; d += 1) {
      if (String(d) === normalized[i]) continue;
      const attempt = normalized.slice(0, i) + d + normalized.slice(i + 1);
      if (isValidCpf(attempt)) hits.push(normalizeCpf(attempt));
    }
  }
  return hits.length === 1 ? { cpf: hits[0], reparado: true } : null;
}

function extractCpfs(text) {
  const re = /(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})/g;
  const out = new Set();
  for (const m of String(text || "").matchAll(re)) {
    const r = repairCpf(m[1]);
    if (r) out.add(r.cpf);
  }
  return [...out];
}

module.exports = {
  repairCnpj,
  extractCnpjs,
  repairCpf,
  extractCpfs,
};
