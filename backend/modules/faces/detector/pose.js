/**
 * Estimativa de pose facial via solvePnP (OpenCV WASM) com fallback roll_only.
 *
 * Landmarks iBUG-68 (0-based) usados no PnP — confirmar contra face-api:
 *   30 nariz, 8 queixo, 36 canto ext. olho esq., 45 canto ext. olho dir.,
 *   48 canto esq. boca, 54 canto dir. boca.
 *
 * Mapeamento Euler (validar empiricamente com fotos de referência):
 *   Após RQDecomp3x3 / decomposeProjectionMatrix da OpenCV, os ângulos retornados
 *   são interpretados como:
 *     - yaw   = rotação em torno do eixo vertical (virar esquerda/direita)
 *     - pitch = rotação em torno do eixo horizontal (olhar cima/baixo)
 *     - roll  = inclinação da cabeça (linha dos olhos)
 *   O mapeamento exato (índice/sinal do vetor euler) é fixado em `mapEulerFromOpenCv`
 *   e deve ser revalidado quando o build do OpenCV mudar. Como sanidade, o roll do
 *   PnP é comparado com atan2 da linha dos olhos (36→45).
 *
 * Runtime: @techstark/opencv-js em Node pode falhar/hangar no WASM em silêncio.
 * Init tem timeout; se falhar → metodo 'roll_only', confiante false, yaw/pitch null.
 */

const { getFacialConfig } = require("../facial.config");

const OBJECT_POINTS_3D = [
  [0, 0, 0], // nose 30
  [0, -330, -65], // chin 8
  [-225, 170, -135], // left eye outer 36
  [225, 170, -135], // right eye outer 45
  [-150, -150, -125], // left mouth 48
  [150, -150, -125], // right mouth 54
];

const LANDMARK_IDX = {
  nose: 30,
  chin: 8,
  leftEyeOuter: 36,
  rightEyeOuter: 45,
  leftMouth: 48,
  rightMouth: 54,
};

let cvModule = null;
let initPromise = null;
let opencvReady = false;
let opencvFailReason = null;

function rollFromEyeLine(landmarks68) {
  const a = landmarks68[LANDMARK_IDX.leftEyeOuter];
  const b = landmarks68[LANDMARK_IDX.rightEyeOuter];
  if (!a || !b) return null;
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return deg;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function loadOpenCv() {
  const cfg = getFacialConfig();
  // eslint-disable-next-line import/no-unresolved
  const mod = require("@techstark/opencv-js");
  let cv = mod && mod.default ? mod.default : mod;

  // @techstark/opencv-js exporta um thenable; o Mat só existe após resolve.
  if (cv && typeof cv.then === "function") {
    cv = await withTimeout(Promise.resolve(cv), cfg.opencvInitTimeoutMs, "opencv init");
  } else if (cv && typeof cv.onRuntimeInitialized !== "undefined" && !cv.Mat) {
    cv = await withTimeout(
      new Promise((resolve) => {
        const prev = cv.onRuntimeInitialized;
        cv.onRuntimeInitialized = () => {
          if (typeof prev === "function") prev();
          resolve(cv);
        };
      }),
      cfg.opencvInitTimeoutMs,
      "opencv onRuntimeInitialized",
    );
  }

  if (!cv || typeof cv.Mat !== "function" || typeof cv.solvePnP !== "function") {
    throw new Error(
      `opencv loaded but solvePnP/Mat unavailable (Mat=${typeof cv?.Mat}, solvePnP=${typeof cv?.solvePnP})`,
    );
  }

  console.info("[faces/pose] opencv ready");
  return cv;
}

async function initOpenCv() {
  if (opencvReady && cvModule) return cvModule;
  if (initPromise) return initPromise;

  initPromise = loadOpenCv()
    .then((cv) => {
      cvModule = cv;
      opencvReady = true;
      opencvFailReason = null;
      return cv;
    })
    .catch((err) => {
      opencvReady = false;
      cvModule = null;
      opencvFailReason = err.message || String(err);
      console.warn(`[faces/pose] opencv unavailable, using roll_only: ${opencvFailReason}`);
      return null;
    })
    .finally(() => {
      // Keep failed promise cached so we don't retry forever on every call;
      // expose resetOpenCvForTests for tests.
    });

  return initPromise;
}

function resetOpenCvForTests() {
  initPromise = null;
  cvModule = null;
  opencvReady = false;
  opencvFailReason = null;
}

/**
 * Mapeamento dos ângulos OpenCV → yaw/pitch/roll.
 * Documentar após calibração empírica; defaults assumem ordem [x,y,z] ≈ pitch,yaw,roll
 * em graus (convenção comum do decomposeProjectionMatrix).
 *
 * Empírico (foto frontal real, Jul/2026): pitch chega ~±170–180° por ambiguidade
 * da decomposição — normalizamos cada eixo para a representação mais próxima de 0°
 * (rosto frontal), sem alterar o roll já validado pela linha dos olhos.
 *
 * @param {number[]} eulerDeg
 * @returns {{ yaw: number, pitch: number, roll: number }}
 */
function mapEulerFromOpenCv(eulerDeg) {
  const pitchRaw = Number(eulerDeg[0]) || 0;
  const yawRaw = Number(eulerDeg[1]) || 0;
  const rollRaw = Number(eulerDeg[2]) || 0;
  return {
    yaw: unwrapFaceAxisDeg(yawRaw),
    pitch: unwrapFaceAxisDeg(pitchRaw),
    roll: normalizeAngleDeg(rollRaw),
  };
}

/** Normaliza para (-180, 180]. */
function normalizeAngleDeg(deg) {
  let a = Number(deg) || 0;
  while (a > 180) a -= 360;
  while (a <= -180) a += 360;
  return a;
}

/**
 * Para eixos de pose facial, prefere o ângulo equivalente mais perto de 0°.
 * Ex.: 177° → -3°; -177° → 3°.
 */
function unwrapFaceAxisDeg(deg) {
  let a = normalizeAngleDeg(deg);
  if (Math.abs(a) > 90) {
    a = normalizeAngleDeg(a - Math.sign(a) * 180);
  }
  return a;
}

/**
 * Fallback quando o build WASM não exporta RQDecomp3x3 / decomposeProjectionMatrix
 * (@techstark/opencv-js). Espelha a convenção XYZ em graus usada pelo OpenCV
 * (mesma ordem típica de RQDecomp3x3: [x,y,z] ≈ pitch,yaw,roll antes do mapEuler).
 * Preferir sempre a API nativa quando existir.
 */
function rotationMatToEulerDeg(cv, rotMat) {
  const r00 = rotMat.doubleAt(0, 0);
  const r01 = rotMat.doubleAt(0, 1);
  const r02 = rotMat.doubleAt(0, 2);
  const r10 = rotMat.doubleAt(1, 0);
  const r11 = rotMat.doubleAt(1, 1);
  const r12 = rotMat.doubleAt(1, 2);
  const r20 = rotMat.doubleAt(2, 0);
  const r21 = rotMat.doubleAt(2, 1);
  const r22 = rotMat.doubleAt(2, 2);

  const sy = Math.sqrt(r00 * r00 + r10 * r10);
  let x;
  let y;
  let z;
  if (sy > 1e-6) {
    x = Math.atan2(r21, r22);
    y = Math.atan2(-r20, sy);
    z = Math.atan2(r10, r00);
  } else {
    x = Math.atan2(-r12, r11);
    y = Math.atan2(-r20, sy);
    z = 0;
  }
  const rad2deg = 180 / Math.PI;
  return [x * rad2deg, y * rad2deg, z * rad2deg];
}

function extractEuler(cv, rvec) {
  const rotMat = new cv.Mat();
  const jacobian = new cv.Mat();
  try {
    cv.Rodrigues(rvec, rotMat, jacobian);

    if (typeof cv.RQDecomp3x3 === "function") {
      const mtxR = new cv.Mat();
      const mtxQ = new cv.Mat();
      const qx = new cv.Mat();
      const qy = new cv.Mat();
      const qz = new cv.Mat();
      try {
        const out = cv.RQDecomp3x3(rotMat, mtxR, mtxQ, qx, qy, qz);
        const angles = Array.isArray(out)
          ? out.slice(0, 3)
          : out && out.eulerAngles
            ? Array.from(out.eulerAngles)
            : null;
        if (angles && angles.length >= 3) return mapEulerFromOpenCv(angles);
      } finally {
        mtxR.delete();
        mtxQ.delete();
        qx.delete();
        qy.delete();
        qz.delete();
      }
    }

    if (typeof cv.decomposeProjectionMatrix === "function") {
      const proj = new cv.Mat(3, 4, cv.CV_64F);
      const cameraMatrix = new cv.Mat();
      const rotMatrix = new cv.Mat();
      const transVect = new cv.Mat();
      const rotMatX = new cv.Mat();
      const rotMatY = new cv.Mat();
      const rotMatZ = new cv.Mat();
      const eulerAngles = new cv.Mat();
      try {
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            proj.doublePtr(r, c)[0] = rotMat.doubleAt(r, c);
          }
          proj.doublePtr(r, 3)[0] = 0;
        }
        cv.decomposeProjectionMatrix(
          proj,
          cameraMatrix,
          rotMatrix,
          transVect,
          rotMatX,
          rotMatY,
          rotMatZ,
          eulerAngles,
        );
        const angles = [
          eulerAngles.doubleAt(0, 0),
          eulerAngles.doubleAt(1, 0),
          eulerAngles.doubleAt(2, 0),
        ];
        return mapEulerFromOpenCv(angles);
      } finally {
        proj.delete();
        cameraMatrix.delete();
        rotMatrix.delete();
        transVect.delete();
        rotMatX.delete();
        rotMatY.delete();
        rotMatZ.delete();
        eulerAngles.delete();
      }
    }

    // WASM @techstark/opencv-js tipicamente não inclui RQDecomp3x3.
    const angles = rotationMatToEulerDeg(cv, rotMat);
    return mapEulerFromOpenCv(angles);
  } finally {
    rotMat.delete();
    jacobian.delete();
  }
}

function estimateWithPnp(cv, landmarks68, imageWidth, imageHeight) {
  const cfg = getFacialConfig();
  const imagePointsData = [
    LANDMARK_IDX.nose,
    LANDMARK_IDX.chin,
    LANDMARK_IDX.leftEyeOuter,
    LANDMARK_IDX.rightEyeOuter,
    LANDMARK_IDX.leftMouth,
    LANDMARK_IDX.rightMouth,
  ].map((idx) => {
    const p = landmarks68[idx];
    return [p.x, p.y];
  });

  const objectPoints = cv.matFromArray(6, 1, cv.CV_64FC3, OBJECT_POINTS_3D.flat());
  const imagePoints = cv.matFromArray(6, 1, cv.CV_64FC2, imagePointsData.flat());

  const fx = imageWidth;
  const fy = imageWidth;
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;
  const cameraMatrix = cv.matFromArray(3, 3, cv.CV_64F, [fx, 0, cx, 0, fy, cy, 0, 0, 1]);
  const distCoeffs = cv.Mat.zeros(4, 1, cv.CV_64F);
  const rvec = new cv.Mat();
  const tvec = new cv.Mat();

  try {
    const ok = cv.solvePnP(
      objectPoints,
      imagePoints,
      cameraMatrix,
      distCoeffs,
      rvec,
      tvec,
      false,
      cv.SOLVEPNP_ITERATIVE,
    );
    if (!ok) throw new Error("solvePnP returned false");

    const mapped = extractEuler(cv, rvec);
    const eyeRoll = rollFromEyeLine(landmarks68);
    let confiante = true;
    if (eyeRoll != null) {
      const delta = Math.abs(mapped.roll - eyeRoll);
      if (delta > cfg.poseRollSanityMaxDeg) confiante = false;
    }

    return {
      yaw: mapped.yaw,
      pitch: mapped.pitch,
      roll: mapped.roll,
      confiante,
      metodo: "pnp",
      rollLinhaOlhos: eyeRoll,
    };
  } finally {
    objectPoints.delete();
    imagePoints.delete();
    cameraMatrix.delete();
    distCoeffs.delete();
    rvec.delete();
    tvec.delete();
  }
}

function estimateRollOnly(landmarks68) {
  const roll = rollFromEyeLine(landmarks68);
  return {
    yaw: null,
    pitch: null,
    roll: roll == null ? 0 : roll,
    confiante: false,
    metodo: "roll_only",
    rollLinhaOlhos: roll,
  };
}

/**
 * @param {Array<{x:number,y:number}>} landmarks68
 * @param {number} imageWidth
 * @param {number} imageHeight
 */
async function estimate(landmarks68, imageWidth, imageHeight) {
  if (!Array.isArray(landmarks68) || landmarks68.length < 68) {
    return estimateRollOnly(landmarks68 || []);
  }

  const cv = await initOpenCv();
  if (!cv) return estimateRollOnly(landmarks68);

  try {
    return estimateWithPnp(cv, landmarks68, imageWidth, imageHeight);
  } catch (err) {
    console.warn(`[faces/pose] PnP failed, falling back to roll_only: ${err.message}`);
    return estimateRollOnly(landmarks68);
  }
}

function getOpenCvStatus() {
  return {
    ready: opencvReady,
    failReason: opencvFailReason,
  };
}

module.exports = {
  estimate,
  initOpenCv,
  getOpenCvStatus,
  resetOpenCvForTests,
  rollFromEyeLine,
  mapEulerFromOpenCv,
  normalizeAngleDeg,
  unwrapFaceAxisDeg,
  LANDMARK_IDX,
};
