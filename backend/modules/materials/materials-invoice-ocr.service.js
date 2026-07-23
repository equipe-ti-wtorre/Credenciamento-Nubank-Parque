const Tesseract = require("tesseract.js");
const db = require("../../config/db");
const AppError = require("../../utils/AppError");
const { hasPermission } = require("../../utils/permissions");

const MATCH_THRESHOLD = 0.55;
const SUGGEST_THRESHOLD = 0.22;
const MAX_SUGGESTIONS = 3;
const UNITS =
  "UN|UND|UNID|KG|G|L|ML|CX|PC|PÇ|PCS|PAR|M|MT|M2|M3|PCT|PACOTE|ROLO|FD|SC|LT";

function assertParseAccess(req) {
  if (
    hasPermission(req.user, "merchandise_entry", "create") ||
    hasPermission(req.user, "merchandise_exit", "create") ||
    hasPermission(req.user, "merchandise_entry", "view") ||
    hasPermission(req.user, "merchandise_exit", "view")
  ) {
    return;
  }
  throw new AppError("Perfil sem permissão para ler NF de mercadorias.", 403);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .filter((t) => t.length >= 2);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function tokensMatch(ta, tb) {
  if (ta === tb) return 1;
  // Nomes resumidos na NF: "CAB" ≈ "cabo", "HDMI" ≈ "hdmi"
  if (ta.length >= 2 && tb.length >= 2 && (tb.startsWith(ta) || ta.startsWith(tb))) {
    const shorter = Math.min(ta.length, tb.length);
    const longer = Math.max(ta.length, tb.length);
    return 0.65 + (shorter / longer) * 0.25;
  }
  if (ta.length >= 3 && tb.includes(ta)) return 0.7;
  if (tb.length >= 3 && ta.includes(tb)) return 0.7;
  return 0;
}

function fuzzyTokenScore(raw, productDescription) {
  const tokensA = tokenize(raw);
  const tokensB = tokenize(productDescription);
  if (!tokensA.length || !tokensB.length) return 0;

  let hitSum = 0;
  for (const ta of tokensA) {
    let best = 0;
    for (const tb of tokensB) {
      best = Math.max(best, tokensMatch(ta, tb));
    }
    hitSum += best;
  }
  // Prioriza cobertura dos tokens da NF (geralmente mais curtos/resumidos)
  return hitSum / tokensA.length;
}

function similarityScore(raw, productDescription) {
  const a = normalizeText(raw);
  const b = normalizeText(productDescription);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return 0.75 + (shorter / longer) * 0.2;
  }

  const fuzzy = fuzzyTokenScore(a, b);
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap += 1;
  }
  const tokenScore = tokensA.size ? overlap / Math.max(tokensA.size, tokensB.size) : 0;

  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const editScore = 1 - dist / maxLen;

  return Math.max(fuzzy, tokenScore * 0.7 + editScore * 0.3, tokenScore, editScore * 0.85);
}

async function preprocessImage(buffer) {
  try {
    // Lazy-load: sharp pode falhar em CPUs sem binário pré-compilado.
    const sharp = require("sharp");
    return await sharp(buffer)
      .rotate()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
  } catch {
    return buffer;
  }
}

async function runOcr(imageBuffer) {
  const result = await Tesseract.recognize(imageBuffer, "por+eng", {
    logger: () => {},
  });
  return String(result?.data?.text || "").trim();
}

function extractInvoiceNumber(text) {
  const patterns = [
    /(?:n[ºo°]?\.?\s*(?:da\s*)?(?:nf|nfe|nota)\s*[:#]?\s*)(\d{3,12})/i,
    /(?:nf[\s-]*(?:e)?\s*n[ºo°]?\.?\s*[:#]?\s*)(\d{3,12})/i,
    /(?:numero\s*(?:da\s*)?(?:nf|nota)\s*[:#]?\s*)(\d{3,12})/i,
    /(?:nota\s*fiscal\s*[:#]?\s*)(\d{3,12})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].replace(/^0+(?=\d)/, "") || m[1];
  }

  // DANFE: bloco numérico isolado comum em cabeçalho
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 20)) {
    const m = line.match(/\b(\d{6,9})\b/);
    if (m && !/20\d{2}/.test(m[1])) return m[1];
  }
  return null;
}

function parseQuantityToken(raw) {
  const normalized = String(raw)
    .replace(/\s/g, "")
    .replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000) / 1000;
}

function extractLineItems(text) {
  const unitRe = new RegExp(`\\b(?:${UNITS})\\b`, "i");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 4);

  const items = [];
  const seen = new Set();

  for (const line of lines) {
    if (/total|subtotal|imposto|icms|ipi|cfop|ncm|chave|protocolo|serie|emitente|destinatario/i.test(line)) {
      continue;
    }

    // "DESCRICAO ... 10 UN" ou "10 UN DESCRICAO"
    const trailingQty = line.match(
      new RegExp(`^(.+?)\\s+(\\d{1,6}(?:[.,]\\d{1,3})?)\\s*(?:${UNITS})?\\s*$`, "i"),
    );
    const leadingQty = line.match(
      new RegExp(`^(\\d{1,6}(?:[.,]\\d{1,3})?)\\s*(?:${UNITS})?\\s+(.+)$`, "i"),
    );

    let rawDescription = null;
    let quantity = null;

    if (trailingQty) {
      rawDescription = trailingQty[1].trim();
      quantity = parseQuantityToken(trailingQty[2]);
    } else if (leadingQty) {
      quantity = parseQuantityToken(leadingQty[1]);
      rawDescription = leadingQty[2].trim();
    } else if (unitRe.test(line)) {
      const m = line.match(
        new RegExp(`(.+?)\\s+(\\d{1,6}(?:[.,]\\d{1,3})?)\\s*(?:${UNITS})`, "i"),
      );
      if (m) {
        rawDescription = m[1].trim();
        quantity = parseQuantityToken(m[2]);
      }
    }

    if (!rawDescription || !quantity) continue;

    // Descarta cabeçalhos curtos / ruído
    const norm = normalizeText(rawDescription);
    if (norm.length < 3) continue;
    if (/^(qtd|quant|descricao|produto|item|codigo|cod)$/.test(norm)) continue;
    if (/^\d+$/.test(norm)) continue;

    const key = `${norm}|${quantity}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      raw_description: rawDescription.slice(0, 200),
      quantity,
    });
  }

  return items.slice(0, 40);
}

function rankProductMatches(rawDescription, products) {
  return products
    .map((product) => ({
      id_product: product.id_product,
      description: product.description,
      unit_measure: product.unit_measure,
      confidence: Math.round(similarityScore(rawDescription, product.description) * 100) / 100,
    }))
    .filter((row) => row.confidence >= SUGGEST_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence);
}

function matchProducts(parsedItems, products) {
  const warnings = [];
  let unmatched = 0;

  const items = parsedItems.map((item) => {
    const ranked = rankProductMatches(item.raw_description, products);
    const best = ranked[0] || null;
    const suggestions = ranked.slice(0, MAX_SUGGESTIONS).map((row) => ({
      id_product: row.id_product,
      description: row.description,
      unit_measure: row.unit_measure,
      confidence: row.confidence,
    }));

    if (best && best.confidence >= MATCH_THRESHOLD) {
      return {
        raw_description: item.raw_description,
        quantity: item.quantity,
        id_product: best.id_product,
        matched_description: best.description,
        confidence: best.confidence,
        suggestions: suggestions.filter((s) => s.id_product !== best.id_product).slice(0, MAX_SUGGESTIONS),
      };
    }

    unmatched += 1;
    return {
      raw_description: item.raw_description,
      quantity: item.quantity,
      id_product: null,
      matched_description: null,
      confidence: best?.confidence || 0,
      suggestions,
    };
  });

  if (unmatched > 0) {
    warnings.push(
      "Alguns itens não foram identificados — escolha um similar ou cadastre o produto",
    );
  }

  return { items, warnings };
}

async function loadActiveProducts() {
  const [rows] = await db.execute(
    `SELECT id_product, description, unit_measure, manufacturer, status
     FROM product WHERE status = 1 ORDER BY description ASC`,
  );
  return rows.map((row) => ({
    id_product: row.id_product,
    description: row.description,
    unit_measure: row.unit_measure,
    manufacturer: row.manufacturer || null,
    status: !!row.status,
  }));
}

/**
 * Lê foto de NF (OCR), extrai número e itens, faz match com catálogo.
 * Não persiste arquivo nem movimentação.
 */
async function parseInvoiceFromPhoto(req, file) {
  assertParseAccess(req);

  if (!file?.buffer?.length) {
    throw new AppError("Envie a foto da NF para leitura.", 400);
  }

  let processed;
  try {
    processed = await preprocessImage(file.buffer);
  } catch {
    throw new AppError("Não foi possível processar a imagem da NF.", 400);
  }

  let ocrText;
  try {
    ocrText = await runOcr(processed);
  } catch (err) {
    throw new AppError(err.message || "Falha ao ler a NF (OCR).", 500);
  }

  if (!ocrText || ocrText.length < 8) {
    throw new AppError(
      "Não foi possível ler texto na imagem. Tente outra foto mais nítida e alinhada.",
      422,
    );
  }

  const invoiceNumber = extractInvoiceNumber(ocrText);
  const parsedItems = extractLineItems(ocrText);
  const products = await loadActiveProducts();
  const { items, warnings } = matchProducts(parsedItems, products);

  if (!invoiceNumber && items.length === 0) {
    warnings.push("Nenhum dado útil foi reconhecido na NF");
  } else if (!items.length) {
    warnings.push("Número da NF pode ter sido lido, mas nenhum item foi reconhecido");
  }

  return {
    invoice_number: invoiceNumber,
    items,
    warnings,
    ocr_preview: ocrText.slice(0, 500),
  };
}

module.exports = {
  parseInvoiceFromPhoto,
  // exported for unit-style reuse / tests
  normalizeText,
  similarityScore,
  extractInvoiceNumber,
  extractLineItems,
  matchProducts,
};
