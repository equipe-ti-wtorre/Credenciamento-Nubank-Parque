const { createCanvas, loadImage } = require("canvas");

/**
 * Manipulação de imagem / métricas.
 * Prefere `sharp` quando o binário nativo carrega; neste host (CPU sem x86-64-v2)
 * cai automaticamente para `jimp` (pure JS) + `canvas`.
 */

const FORMAT_JPEG = "jpeg";
const FORMAT_PNG = "png";
const FORMAT_WEBP = "webp";
const FORMAT_HEIC = "heic";
const FORMAT_UNKNOWN = "unknown";

let sharp = null;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  sharp = require("sharp");
} catch {
  sharp = null;
  console.warn("[faces/image] sharp unavailable — using jimp/canvas fallback");
}

function detectFormat(buf) {
  if (!buf || buf.length < 12) return FORMAT_UNKNOWN;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return FORMAT_JPEG;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return FORMAT_PNG;
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return FORMAT_WEBP;
  }
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const head = buf.toString("ascii", 8, Math.min(32, buf.length)).toLowerCase();
    if (head.includes("heic") || head.includes("heif") || head.includes("mif1") || head.includes("msf1")) {
      return FORMAT_HEIC;
    }
  }
  return FORMAT_UNKNOWN;
}

function computeGrayStats(data, width, height, channels) {
  const n = width * height;
  const gray = new Float64Array(n);
  let lumaSum = 0;
  let satHigh = 0;
  let satLow = 0;

  for (let i = 0; i < n; i++) {
    const o = i * channels;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = y;
    lumaSum += y;
    if (y >= 250) satHigh += 1;
    if (y <= 5) satLow += 1;
  }

  let lapSum = 0;
  let lapSumSq = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = -gray[i - width] - gray[i - 1] + 4 * gray[i] - gray[i + 1] - gray[i + width];
      lapSum += lap;
      lapSumSq += lap * lap;
      lapCount += 1;
    }
  }
  const lapMean = lapCount ? lapSum / lapCount : 0;
  const laplacianVariance = lapCount ? lapSumSq / lapCount - lapMean * lapMean : 0;

  return {
    lumaMean: lumaSum / n,
    satHighRatio: satHigh / n,
    satLowRatio: satLow / n,
    laplacianVariance,
  };
}

async function analyzeWithSharp(imageBuffer, format) {
  const meta = await sharp(imageBuffer, { failOn: "none" }).rotate().metadata();
  const { data, info } = await sharp(imageBuffer, { failOn: "none" })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const stats = computeGrayStats(data, info.width, info.height, info.channels);
  const normalizedBuffer = await sharp(imageBuffer, { failOn: "none" }).rotate().toBuffer();

  return {
    format: format === FORMAT_JPEG || format === FORMAT_PNG ? format : meta.format || format,
    byteSize: imageBuffer.length,
    width: meta.width || info.width,
    height: meta.height || info.height,
    ...stats,
    normalizedBuffer,
    engine: "sharp",
  };
}

async function analyzeWithJimp(imageBuffer, format) {
  const { Jimp } = require("jimp");
  const img = await Jimp.read(imageBuffer);
  // Jimp auto-applies EXIF orientation on read for JPEG in recent versions
  const width = img.width;
  const height = img.height;
  const { data } = img.bitmap; // RGBA
  const stats = computeGrayStats(data, width, height, 4);

  let normalizedBuffer = imageBuffer;
  if (format === FORMAT_JPEG) {
    normalizedBuffer = await img.getBuffer("image/jpeg");
  } else if (format === FORMAT_PNG) {
    normalizedBuffer = await img.getBuffer("image/png");
  } else {
    // webp etc. — re-encode jpeg for detector
    normalizedBuffer = await img.getBuffer("image/jpeg");
  }

  return {
    format,
    byteSize: imageBuffer.length,
    width,
    height,
    ...stats,
    normalizedBuffer,
    engine: "jimp",
  };
}

async function analyzeImage(imageBuffer) {
  const format = detectFormat(imageBuffer);
  const byteSize = imageBuffer.length;

  if (format === FORMAT_HEIC || format === FORMAT_UNKNOWN) {
    return {
      format,
      byteSize,
      width: null,
      height: null,
      lumaMean: null,
      satHighRatio: null,
      satLowRatio: null,
      laplacianVariance: null,
      normalizedBuffer: null,
      engine: null,
    };
  }

  if (sharp) {
    try {
      return await analyzeWithSharp(imageBuffer, format);
    } catch (err) {
      console.warn(`[faces/image] sharp analyze failed, jimp fallback: ${err.message}`);
    }
  }
  return analyzeWithJimp(imageBuffer, format);
}

async function analyzeLightingWithJimp(imageBuffer, box) {
  const { Jimp } = require("jimp");
  const img = await Jimp.read(imageBuffer);
  const w = img.width;
  const h = img.height;
  let x = Math.floor(box.x);
  let y = Math.floor(box.y);
  let bw = Math.ceil(box.width);
  let bh = Math.ceil(box.height);
  // margem leve no rosto (fundo branco fora não conta)
  const padX = Math.round(bw * 0.08);
  const padY = Math.round(bh * 0.08);
  x = Math.max(0, x + padX);
  y = Math.max(0, y + padY);
  bw = Math.max(8, Math.min(bw - padX * 2, w - x));
  bh = Math.max(8, Math.min(bh - padY * 2, h - y));
  const crop = img.clone().crop({ x, y, w: bw, h: bh });
  return computeGrayStats(crop.bitmap.data, crop.width, crop.height, 4);
}

/**
 * Estatísticas de iluminação priorizando a região do rosto (evita falso
 * saturado por fundo branco de foto 3x4 / crachá).
 */
async function analyzeLightingRegion(imageBuffer, box) {
  if (!box || box.width < 8 || box.height < 8) return null;
  if (sharp) {
    try {
      const meta = await sharp(imageBuffer, { failOn: "none" }).rotate().metadata();
      const w = meta.width || 0;
      const h = meta.height || 0;
      let x = Math.floor(box.x);
      let y = Math.floor(box.y);
      let bw = Math.ceil(box.width);
      let bh = Math.ceil(box.height);
      const padX = Math.round(bw * 0.08);
      const padY = Math.round(bh * 0.08);
      x = Math.max(0, x + padX);
      y = Math.max(0, y + padY);
      bw = Math.max(8, Math.min(bw - padX * 2, w - x));
      bh = Math.max(8, Math.min(bh - padY * 2, h - y));
      const { data, info } = await sharp(imageBuffer, { failOn: "none" })
        .rotate()
        .extract({ left: x, top: y, width: bw, height: bh })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return computeGrayStats(data, info.width, info.height, info.channels);
    } catch (err) {
      console.warn(`[faces/image] lighting region sharp failed: ${err.message}`);
    }
  }
  return analyzeLightingWithJimp(imageBuffer, box);
}

async function encodeJpegJimp(imageBuffer, width, height, quality) {
  const { Jimp } = require("jimp");
  const img = await Jimp.read(imageBuffer);
  img.resize({ w: width, h: height });
  // jimp quality 0-100
  return img.getBuffer("image/jpeg", { quality });
}

async function encodeJpegSharp(imageBuffer, width, height, quality) {
  return sharp(imageBuffer, { failOn: "none" })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

/**
 * Tenta comprimir JPEG em várias qualities até caber em maxBytes.
 */
async function tryJpegUnderBudget(imageBuffer, { width, height, maxBytes }) {
  const qualities = [85, 75, 65, 55, 45, 35, 25];
  let last = null;
  for (const q of qualities) {
    let out;
    if (sharp) {
      try {
        out = await encodeJpegSharp(imageBuffer, width, height, q);
      } catch {
        out = await encodeJpegJimp(imageBuffer, width, height, q);
      }
    } else {
      out = await encodeJpegJimp(imageBuffer, width, height, q);
    }
    last = out;
    if (out.length <= maxBytes) {
      return { viable: true, bytes: out.length, width, height, quality: q };
    }
  }
  return {
    viable: false,
    bytes: last ? last.length : null,
    width,
    height,
    quality: 25,
  };
}

/**
 * Helper: gera JPEG via canvas (testes/smoke sem sharp).
 */
async function canvasToJpegBuffer(drawFn, width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawFn(ctx, width, height);
  return canvas.toBuffer("image/jpeg", { quality: 0.9 });
}

module.exports = {
  detectFormat,
  analyzeImage,
  analyzeLightingRegion,
  tryJpegUnderBudget,
  canvasToJpegBuffer,
  loadImage,
  FORMAT_JPEG,
  FORMAT_PNG,
  FORMAT_WEBP,
  FORMAT_HEIC,
  FORMAT_UNKNOWN,
};
