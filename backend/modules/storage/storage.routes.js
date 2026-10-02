const path = require("path");
const fs = require("fs");
const express = require("express");
const AppError = require("../../utils/AppError");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { readPictureJson } = require("./picture-src");

const router = express.Router();
const picturesDir = path.join(__dirname, "../../storage/pictures");
const merchandiseDir = path.resolve(__dirname, "../../storage/merchandise");
const SAFE_MERCH_NAME = /^[A-Za-z0-9._-]{1,255}$/;
const companyLogosDir = path.join(__dirname, "../../storage/company-logos");
const eventCoversDir = path.join(__dirname, "../../storage/event-accreditation-covers");
const eventModuleCoversDir = path.join(__dirname, "../../storage/event-covers");

function sendStoredFile(dir, filenameParam, res, next) {
  try {
    const raw = Array.isArray(filenameParam) ? filenameParam[0] : filenameParam;
    const filename = path.basename(String(raw || ""));
    if (!filename || filename === "." || filename.includes("..")) {
      throw new AppError("Arquivo inválido.", 400);
    }
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) {
      throw new AppError("Imagem não encontrada.", 404);
    }
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
}

function serveDir(dir) {
  return (req, res, next) => {
    sendStoredFile(dir, req.query.filename || req.params.filename, res, next);
  };
}

function wantsJson(req) {
  return String(req.query.format || "").toLowerCase() === "json";
}

// Query `?filename=` evita que o Nginx trate a URL como arquivo estático (.jpg/.png).
router.get("/pictures", authMiddleware, async (req, res, next) => {
  try {
    if (wantsJson(req)) {
      const payload = await readPictureJson(req.query.filename);
      if (!payload) throw new AppError("Imagem não encontrada.", 404);
      res.json(payload);
      return;
    }
    sendStoredFile(picturesDir, req.query.filename, res, next);
  } catch (err) {
    next(err);
  }
});
router.get("/pictures/:filename", authMiddleware, serveDir(picturesDir));

router.get("/merchandise", authMiddleware, (req, res, next) => {
  try {
    const raw = String(Array.isArray(req.query.filename) ? req.query.filename[0] : req.query.filename || "");
    const filename = path.basename(raw);
    if (raw !== filename || !SAFE_MERCH_NAME.test(filename)) {
      throw new AppError("Nome de arquivo inválido.", 400);
    }
    const abs = path.resolve(merchandiseDir, filename);
    if (!abs.startsWith(merchandiseDir + path.sep)) {
      throw new AppError("Nome de arquivo inválido.", 400);
    }
    if (!fs.existsSync(abs)) {
      throw new AppError("Arquivo não encontrado.", 404);
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(abs);
  } catch (err) {
    next(err);
  }
});

router.get("/company-logos", authMiddleware, serveDir(companyLogosDir));
router.get("/company-logos/:filename", authMiddleware, serveDir(companyLogosDir));

router.get("/event-accreditation-covers", authMiddleware, serveDir(eventCoversDir));
router.get("/event-accreditation-covers/:filename", authMiddleware, serveDir(eventCoversDir));

router.get("/event-covers", authMiddleware, serveDir(eventModuleCoversDir));
router.get("/event-covers/:filename", authMiddleware, serveDir(eventModuleCoversDir));

module.exports = router;
