const fs = require("fs");
const path = require("path");

const PICTURES_DIR = path.join(__dirname, "../../storage/pictures");

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function safePicturePath(filename) {
  const name = path.basename(String(filename || ""));
  if (!name || name === "." || name.includes("..")) return null;
  const filePath = path.join(PICTURES_DIR, name);
  if (!fs.existsSync(filePath)) return null;
  return { name, filePath, ext: path.extname(name).toLowerCase() };
}

/**
 * Miniatura JPEG em data URL para <img src>.
 * Evita segunda request no front e URLs .jpg interceptadas pelo Nginx.
 */
async function readPictureThumbDataUrl(filename, { size = 160 } = {}) {
  const file = safePicturePath(filename);
  if (!file) return null;
  try {
    const sharp = require("sharp");
    const buf = await sharp(file.filePath)
      .rotate()
      .resize(size, size, { fit: "cover", withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    try {
      const buf = fs.readFileSync(file.filePath);
      const mime = MIME_BY_EXT[file.ext] || "image/jpeg";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      return null;
    }
  }
}

async function readPictureJson(filename) {
  const src = await readPictureThumbDataUrl(filename, { size: 320 });
  if (!src) return null;
  return { src, filename: path.basename(String(filename)) };
}

module.exports = {
  PICTURES_DIR,
  safePicturePath,
  readPictureThumbDataUrl,
  readPictureJson,
};
