const path = require("path");
const fs = require("fs");
const express = require("express");
const AppError = require("../../utils/AppError");
const { authMiddleware } = require("../../middleware/authMiddleware");

const router = express.Router();
const storageDir = path.join(__dirname, "../../storage/pictures");

router.get("/pictures/:filename", authMiddleware, (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename);
    if (!filename || filename.includes("..")) {
      throw new AppError("Arquivo inválido.", 400);
    }
    const filePath = path.join(storageDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new AppError("Imagem não encontrada.", 404);
    }
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
