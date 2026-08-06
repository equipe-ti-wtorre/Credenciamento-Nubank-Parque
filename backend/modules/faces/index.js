const { validarFoto } = require("./facial.validator");
const detector = require("./detector/faceapi.detector");
const poseSolver = require("./detector/pose");
const ear = require("./detector/ear");

module.exports = {
  validarFoto,
  detector,
  poseSolver,
  ear,
};
