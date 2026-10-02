const fs = require("fs");
const path = require("path");

const THUMB_WIDTH = 208;
const THUMB_HEIGHT = 156;

function createCoverStore(dirName) {
  const COVER_DIR = path.join(__dirname, "../../storage", dirName);
  const THUMBS_DIR = path.join(COVER_DIR, "thumbs");

  function safeCoverName(filename) {
    const name = path.basename(String(filename || ""));
    if (!name || name === "." || name.includes("..")) return null;
    return name;
  }

  function coverPath(filename) {
    const name = safeCoverName(filename);
    if (!name) return null;
    const filePath = path.join(COVER_DIR, name);
    if (!fs.existsSync(filePath)) return null;
    return { name, filePath };
  }

  function thumbCachePaths(filename) {
    const name = safeCoverName(filename);
    if (!name) return [];
    return [
      path.join(THUMBS_DIR, `${name}.jpg`),
      path.join(COVER_DIR, `${name}.thumb.jpg`),
    ];
  }

  function readThumbDataUrl(filePath) {
    const buf = fs.readFileSync(filePath);
    if (!buf?.length) return null;
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  }

  function bufferToDataUrl(buf) {
    if (!buf?.length) return null;
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  }

  async function resizeCover(filePath) {
    const sharp = require("sharp");
    try {
      return await sharp(filePath)
        .rotate()
        .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover" })
        .jpeg({ quality: 72 })
        .toBuffer();
    } catch {
      return await sharp(filePath)
        .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover" })
        .jpeg({ quality: 70 })
        .toBuffer();
    }
  }

  function persistThumb(filename, buf) {
    const [preferred, fallback] = thumbCachePaths(filename);
    try {
      fs.mkdirSync(path.dirname(preferred), { recursive: true });
      fs.writeFileSync(preferred, buf);
      return preferred;
    } catch {
      try {
        fs.writeFileSync(fallback, buf);
        return fallback;
      } catch {
        return null;
      }
    }
  }

  async function writeCoverThumb(filename) {
    const file = coverPath(filename);
    if (!file) return null;
    try {
      const buf = await resizeCover(file.filePath);
      persistThumb(file.name, buf);
      return bufferToDataUrl(buf);
    } catch {
      return null;
    }
  }

  function removeCoverThumb(filename) {
    for (const dest of thumbCachePaths(filename)) {
      try {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
    }
  }

  function removeCoverFile(filename) {
    const name = safeCoverName(filename);
    if (!name) return;
    const stored = path.join(COVER_DIR, name);
    try {
      if (fs.existsSync(stored)) fs.unlinkSync(stored);
    } catch {
      /* ignore */
    }
    removeCoverThumb(name);
  }

  async function readCoverThumbDataUrl(filename) {
    const name = safeCoverName(filename);
    if (!name) return null;
    for (const dest of thumbCachePaths(name)) {
      if (!fs.existsSync(dest)) continue;
      try {
        const src = readThumbDataUrl(dest);
        if (src) return src;
      } catch {
        /* regenerate */
      }
    }
    return writeCoverThumb(name);
  }

  async function attachCoverThumbs(items) {
    const list = Array.isArray(items) ? items : [];
    const unique = [...new Set(list.map((i) => safeCoverName(i.cover)).filter(Boolean))];
    const map = new Map();
    await Promise.all(
      unique.map(async (name) => {
        try {
          map.set(name, await readCoverThumbDataUrl(name));
        } catch {
          map.set(name, null);
        }
      }),
    );
    return list.map((item) => ({
      ...item,
      cover_thumb: item.cover ? map.get(safeCoverName(item.cover)) || null : null,
    }));
  }

  return {
    COVER_DIR,
    THUMBS_DIR,
    writeCoverThumb,
    removeCoverThumb,
    removeCoverFile,
    readCoverThumbDataUrl,
    attachCoverThumbs,
  };
}

const accreditationCovers = createCoverStore("event-accreditation-covers");

module.exports = {
  createCoverStore,
  COVER_DIR: accreditationCovers.COVER_DIR,
  THUMBS_DIR: accreditationCovers.THUMBS_DIR,
  writeCoverThumb: accreditationCovers.writeCoverThumb,
  removeCoverThumb: accreditationCovers.removeCoverThumb,
  removeCoverFile: accreditationCovers.removeCoverFile,
  readCoverThumbDataUrl: accreditationCovers.readCoverThumbDataUrl,
  attachCoverThumbs: accreditationCovers.attachCoverThumbs,
};
