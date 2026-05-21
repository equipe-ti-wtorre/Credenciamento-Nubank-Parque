const crypto = require("crypto");
require("dotenv").config();

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || "";
  if (!raw || raw.length < 32) {
    throw new Error("ENCRYPTION_KEY inválida ou ausente (mínimo 32 caracteres).");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(plainText) {
  if (!plainText) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(ciphertext) {
  if (!ciphertext) return null;
  const key = getKey();
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = data.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

module.exports = { encrypt, decrypt };
