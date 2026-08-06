const { validarFoto } = require("./facial.validator");
const AppError = require("../../utils/AppError");

async function validar(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      throw new AppError("Envie uma imagem no campo 'picture' ou 'file'.", 400);
    }
    const report = await validarFoto(req.file.buffer, { includeMeta: true });
    res.json(report);
  } catch (err) {
    next(err);
  }
}

module.exports = { validar };
