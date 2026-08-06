const path = require("path");
const { createCanvas, loadImage } = require("canvas");

/**
 * Detector facial via @vladmandic/face-api.
 *
 * Nota de runtime:
 * - `@tensorflow/tfjs-node` provoca Illegal instruction neste host.
 * - Usamos `face-api.node-wasm.js` + backend WASM.
 * - O build WASM não aceita node-canvas como HTMLCanvasElement; convertemos
 *   pixels → `tf.tensor3d` [h,w,3].
 *
 * Landmarks: modelo iBUG-68 (índices 0-based).
 */

const MODEL_DIR = path.join(__dirname, "../../../models/face-api");

let faceapi = null;
let initPromise = null;

async function loadFaceApi() {
  // eslint-disable-next-line import/no-unresolved
  faceapi = require("@vladmandic/face-api/dist/face-api.node-wasm.js");
  await faceapi.tf.setBackend("wasm");
  await faceapi.tf.ready();
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_DIR);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR);
}

async function init() {
  if (initPromise) return initPromise;
  initPromise = loadFaceApi().catch((err) => {
    initPromise = null;
    throw err;
  });
  return initPromise;
}

/**
 * @param {import('canvas').Canvas} canvas
 * @returns {import('@tensorflow/tfjs').Tensor3D}
 */
function canvasToRgbTensor(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return faceapi.tf.tensor3d(rgb, [height, width, 3]);
}

/**
 * @param {Buffer} imageBuffer
 */
async function detect(imageBuffer) {
  await init();

  const img = await loadImage(imageBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const tensor = canvasToRgbTensor(canvas);
  try {
    const detections = await faceapi
      .detectAllFaces(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks();

    const faces = detections.map((d) => {
      const box = d.detection.box;
      const positions = d.landmarks.positions;
      return {
        box: {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        },
        landmarks68: positions.map((p) => ({ x: p.x, y: p.y })),
        score: d.detection.score,
      };
    });

    return {
      faces,
      imageWidth: img.width,
      imageHeight: img.height,
    };
  } finally {
    tensor.dispose();
  }
}

module.exports = {
  init,
  detect,
};
