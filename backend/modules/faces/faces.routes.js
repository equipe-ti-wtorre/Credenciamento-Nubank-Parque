const express = require("express");
const facesController = require("./faces.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { authorizePermission } = require("../../middleware/permissionMiddleware");
const { createUploadMiddleware } = require("../../middleware/upload.middleware");

const router = express.Router();

const FACE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);
const FACE_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/octet-stream",
]);

const faceValidateUpload = createUploadMiddleware({
  fieldName: "picture",
  extensions: FACE_EXTENSIONS,
  mimetypes: FACE_MIMETYPES,
  maxSize: 5 * 1024 * 1024,
  invalidMessage: "Imagem inválida. Use JPEG, PNG, WebP ou HEIC (máx. 5MB).",
});

// Aceitar também campo "file"
const faceValidateUploadFile = createUploadMiddleware({
  fieldName: "file",
  extensions: FACE_EXTENSIONS,
  mimetypes: FACE_MIMETYPES,
  maxSize: 5 * 1024 * 1024,
  invalidMessage: "Imagem inválida. Use JPEG, PNG, WebP ou HEIC (máx. 5MB).",
});

function uploadPictureOrFile(req, res, next) {
  faceValidateUpload(req, res, (err) => {
    if (!err) return next();
    if (err.message && /Nenhum arquivo/i.test(err.message)) {
      return faceValidateUploadFile(req, res, next);
    }
    return next(err);
  });
}

const canView = [authMiddleware, authorizePermission("collaborators", "view")];

router.post("/validar", ...canView, uploadPictureOrFile, facesController.validar);

module.exports = router;
