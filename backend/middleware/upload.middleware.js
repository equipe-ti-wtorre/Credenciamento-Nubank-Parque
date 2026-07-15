const path = require("path");
const multer = require("multer");
const AppError = require("../utils/AppError");

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const BULK_MIMETYPES = new Set([
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

const BULK_EXTENSIONS = new Set([".csv", ".xlsx", ".xls"]);

const IMAGE_MIMETYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function matchesAllowed(file, extensions, mimetypes) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (extensions.has(ext)) return true;
  if (file.mimetype && mimetypes.has(file.mimetype)) return true;
  return false;
}

function createUploadMiddleware({ fieldName, extensions, mimetypes, maxSize, invalidMessage }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize, files: 1 },
    fileFilter(_req, file, cb) {
      if (!matchesAllowed(file, extensions, mimetypes)) {
        return cb(new AppError(invalidMessage, 400));
      }
      cb(null, true);
    },
  }).single(fieldName);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        if (err instanceof AppError) return next(err);
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new AppError(`Arquivo excede o limite de ${Math.round(maxSize / 1024 / 1024)}MB.`, 400));
        }
        return next(new AppError(err.message || "Falha no upload.", 400));
      }
      if (!req.file) {
        return next(new AppError("Nenhum arquivo enviado.", 400));
      }
      next();
    });
  };
}

const bulkUploadMiddleware = createUploadMiddleware({
  fieldName: "file",
  extensions: BULK_EXTENSIONS,
  mimetypes: BULK_MIMETYPES,
  maxSize: MAX_FILE_SIZE,
  invalidMessage: "Formato não permitido. Envie .csv, .xlsx ou .xls (máx. 5MB).",
});

const pictureUploadMiddleware = createUploadMiddleware({
  fieldName: "picture",
  extensions: IMAGE_EXTENSIONS,
  mimetypes: IMAGE_MIMETYPES,
  maxSize: 2 * 1024 * 1024,
  invalidMessage: "Imagem inválida. Use JPEG, PNG ou WebP (máx. 2MB).",
});

function createOptionalUploadMiddleware({ fieldName, extensions, mimetypes, maxSize, invalidMessage }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize, files: 1 },
    fileFilter(_req, file, cb) {
      if (!matchesAllowed(file, extensions, mimetypes)) {
        return cb(new AppError(invalidMessage, 400));
      }
      cb(null, true);
    },
  }).single(fieldName);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        if (err instanceof AppError) return next(err);
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new AppError(`Arquivo excede o limite de ${Math.round(maxSize / 1024 / 1024)}MB.`, 400),
          );
        }
        return next(new AppError(err.message || "Falha no upload.", 400));
      }
      next();
    });
  };
}

const merchandisePhotoMiddleware = createOptionalUploadMiddleware({
  fieldName: "photo",
  extensions: IMAGE_EXTENSIONS,
  mimetypes: IMAGE_MIMETYPES,
  maxSize: 2 * 1024 * 1024,
  invalidMessage: "Imagem inválida. Use JPEG, PNG ou WebP (máx. 2MB).",
});

module.exports = {
  bulkUploadMiddleware,
  pictureUploadMiddleware,
  merchandisePhotoMiddleware,
  createUploadMiddleware,
  MAX_FILE_SIZE,
};
