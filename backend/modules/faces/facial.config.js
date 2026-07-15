const env = require("../../config/env");

/**
 * Limiares do validador facial.
 * Todos os valores vêm de env e devem ser **calibrados** com fotos reais do balcão.
 */
function getFacialConfig() {
  const f = env.faces || {};
  return {
    centerMaxOffsetRatio: f.centerMaxOffsetRatio,
    marginMinRatio: f.marginMinRatio,
    widthMinRatio: f.widthMinRatio,
    widthMaxRatio: f.widthMaxRatio,
    poseMaxYawDeg: f.poseMaxYawDeg,
    poseMaxPitchDeg: f.poseMaxPitchDeg,
    poseMaxRollDeg: f.poseMaxRollDeg,
    poseMarginDeg: f.poseMarginDeg,
    poseRollSanityMaxDeg: f.poseRollSanityMaxDeg,
    earMin: f.earMin,
    laplacianMin: f.laplacianMin,
    lumaMin: f.lumaMin,
    lumaMax: f.lumaMax,
    satHighRatioMax: f.satHighRatioMax,
    satLowRatioMax: f.satLowRatioMax,
    opencvInitTimeoutMs: f.opencvInitTimeoutMs,
    dahua: f.dahua,
    controlid: f.controlid,
    modelsPath: f.modelsPath,
  };
}

module.exports = { getFacialConfig };
