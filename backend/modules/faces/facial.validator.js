const detector = require("./detector/faceapi.detector");
const poseSolver = require("./detector/pose");
const { computeEar } = require("./detector/ear");
const { analyzeImage } = require("./facial.image");
const { runChecks } = require("./facial.checks");

/**
 * Valida se uma foto atende aos requisitos de cadastro facial (Control iD + Dahua).
 * Sem reconhecimento, embedding ou contato com equipamento.
 *
 * @param {Buffer} imageBuffer
 * @param {object} [opts]
 * @returns {Promise<{
 *   apto: { controlid: boolean, dahua: boolean },
 *   checagens: object[],
 *   resumo: { bloqueios_intrinsecos: object[], ajustaveis: object[] },
 *   meta?: object
 * }>}
 */
async function validarFoto(imageBuffer, opts = {}) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    const checagens = [
      {
        id: "formato",
        status: "falha",
        medido: null,
        limite: ["jpeg", "png"],
        fabricantes_afetados: ["controlid", "dahua"],
        tipo: "ajustavel",
        mensagem: "Buffer de imagem vazio ou inválido.",
      },
    ];
    return buildReport(checagens);
  }

  const imageMeta = await analyzeImage(imageBuffer);
  const bufferForDetect = imageMeta.normalizedBuffer || imageBuffer;

  let detection = { faces: [], imageWidth: imageMeta.width || 0, imageHeight: imageMeta.height || 0 };
  let pose = { yaw: null, pitch: null, roll: null, confiante: false, metodo: "roll_only" };
  let ear = { earEsq: null, earDir: null, earMedio: null };

  if (imageMeta.normalizedBuffer || (imageMeta.width && imageMeta.height)) {
    try {
      detection = await detector.detect(bufferForDetect);
    } catch (err) {
      detection = {
        faces: [],
        imageWidth: imageMeta.width || 0,
        imageHeight: imageMeta.height || 0,
        error: err.message,
      };
    }
  }

  if (detection.faces.length === 1) {
    const face = detection.faces[0];
    pose = await poseSolver.estimate(
      face.landmarks68,
      detection.imageWidth,
      detection.imageHeight,
    );
    ear = computeEar(face.landmarks68);
  } else if (opts.includeMeta) {
    // Garante status OpenCV no meta mesmo sem rosto (gate de auditoria).
    await poseSolver.initOpenCv();
  }

  const checagens = await runChecks({
    detection,
    imageBuffer: bufferForDetect,
    imageMeta,
    pose,
    ear,
  });

  const report = buildReport(checagens);
  if (opts.includeMeta) {
    report.meta = {
      format: imageMeta.format,
      width: imageMeta.width,
      height: imageMeta.height,
      byteSize: imageMeta.byteSize,
      faces: detection.faces.length,
      pose,
      ear,
      opencv: poseSolver.getOpenCvStatus(),
    };
  }
  return report;
}

function buildReport(checagens) {
  const falhaPara = (fab) =>
    checagens.some((c) => c.status === "falha" && (c.fabricantes_afetados || []).includes(fab));

  const bloqueios_intrinsecos = checagens.filter(
    (c) => c.tipo === "intrinseco" && (c.status === "falha" || c.status === "aviso"),
  );
  const ajustaveis = checagens.filter((c) => c.tipo === "ajustavel");

  return {
    apto: {
      controlid: !falhaPara("controlid"),
      dahua: !falhaPara("dahua"),
    },
    checagens,
    resumo: {
      bloqueios_intrinsecos,
      ajustaveis,
    },
  };
}

module.exports = {
  validarFoto,
  buildReport,
};
