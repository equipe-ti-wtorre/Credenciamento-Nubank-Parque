const path = require("path");
const fs = require("fs");
const express = require("express");
const AppError = require("../../utils/AppError");
const { authMiddleware } = require("../../middleware/authMiddleware");

const router = express.Router();
const picturesDir = path.join(__dirname, "../../storage/pictures");
const merchandiseDir = path.join(__dirname, "../../storage/merchandise");
const companyLogosDir = path.join(__dirname, "../../storage/company-logos");

function sendStoredFile(dir, filenameParam, res, next) {
  try {
    const filename = path.basename(filenameParam);
    if (!filename || filename.includes("..")) {
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

router.get("/pictures/:filename", authMiddleware, (req, res, next) => {
  sendStoredFile(picturesDir, req.params.filename, res, next);
});

router.get("/merchandise/:filename", authMiddleware, (req, res, next) => {
  sendStoredFile(merchandiseDir, req.params.filename, res, next);
});

router.get("/company-logos/:filename", authMiddleware, (req, res, next) => {
  sendStoredFile(companyLogosDir, req.params.filename, res, next);
});

module.exports = router;
