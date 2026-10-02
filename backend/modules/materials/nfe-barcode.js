const { LuminanceSource, HybridBinarizer, BinaryBitmap, MultiFormatReader, DecodeHintType, BarcodeFormat } =
  require("@zxing/library");

class GrayLuminanceSource extends LuminanceSource {
  constructor(buffer, width, height) {
    super(width, height);
    this.luminances = buffer instanceof Uint8ClampedArray ? buffer : new Uint8ClampedArray(buffer);
  }

  getRow(y, row) {
    const width = this.getWidth();
    const start = y * width;
    const out = row && row.length >= width ? row : new Uint8ClampedArray(width);
    out.set(this.luminances.subarray(start, start + width));
    return out;
  }

  getMatrix() {
    return this.luminances;
  }

  isCropSupported() {
    return false;
  }

  isRotateSupported() {
    return false;
  }
}

async function decodeCode128FromBuffer(imageBuffer) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    return null;
  }

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new MultiFormatReader();
  reader.setHints(hints);

  const angles = [0, 90, 180, 270];
  for (const angle of angles) {
    try {
      const { data, info } = await sharp(imageBuffer)
        .rotate(angle)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const source = new GrayLuminanceSource(data, info.width, info.height);
      const bitmap = new BinaryBitmap(new HybridBinarizer(source));
      const result = reader.decode(bitmap);
      const text = String(result?.getText?.() || result?.text || "").replace(/\D/g, "");
      if (text) return text;
    } catch {
      /* tenta o próximo ângulo */
    }
  }
  return null;
}

module.exports = {
  decodeCode128FromBuffer,
  GrayLuminanceSource,
};
