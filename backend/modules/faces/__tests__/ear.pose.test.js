/**
 * Testes determinísticos de EAR e smoke de pose.
 * Executar: node modules/faces/__tests__/ear.pose.test.js
 */
const assert = require("assert");
const { earFromSix, computeEar } = require("../detector/ear");
const poseSolver = require("../detector/pose");

function openEyePoints() {
  // Wide vertical opening → high EAR
  // P1(36) P2(37) P3(38) P4(39) P5(40) P6(41)
  return [
    { x: 0, y: 0 }, // P1
    { x: 1, y: -2 }, // P2
    { x: 2, y: -2 }, // P3
    { x: 3, y: 0 }, // P4
    { x: 2, y: 2 }, // P5
    { x: 1, y: 2 }, // P6
  ];
}

function closedEyePoints() {
  return [
    { x: 0, y: 0 },
    { x: 1, y: -0.1 },
    { x: 2, y: -0.1 },
    { x: 3, y: 0 },
    { x: 2, y: 0.1 },
    { x: 1, y: 0.1 },
  ];
}

function testEarOpenVsClosed() {
  const open = earFromSix(openEyePoints());
  const closed = earFromSix(closedEyePoints());
  assert.ok(open != null && closed != null, "EAR não nulo");
  assert.ok(open > 0.5, `EAR aberto esperado alto, got ${open}`);
  assert.ok(closed < 0.15, `EAR fechado esperado baixo, got ${closed}`);
  assert.ok(open > closed, "EAR aberto > fechado");

  const landmarks = new Array(68).fill(null).map(() => ({ x: 0, y: 0 }));
  const left = openEyePoints();
  const right = openEyePoints();
  for (let i = 0; i < 6; i++) {
    landmarks[36 + i] = left[i];
    landmarks[42 + i] = { x: right[i].x + 10, y: right[i].y };
  }
  const { earMedio } = computeEar(landmarks);
  assert.ok(earMedio >= 0.22, `earMedio aberto >= 0.22, got ${earMedio}`);

  for (let i = 0; i < 6; i++) {
    landmarks[36 + i] = closedEyePoints()[i];
    landmarks[42 + i] = closedEyePoints()[i];
  }
  const closedAvg = computeEar(landmarks).earMedio;
  assert.ok(closedAvg < 0.22, `earMedio fechado < 0.22, got ${closedAvg}`);

  console.log("PASS ear open/closed");
}

function syntheticLandmarksFrontal(w = 400, h = 400) {
  const lm = new Array(68).fill(null).map(() => ({ x: w / 2, y: h / 2 }));
  // Rough frontal layout
  lm[8] = { x: w / 2, y: h * 0.75 }; // chin
  lm[30] = { x: w / 2, y: h * 0.45 }; // nose
  lm[36] = { x: w * 0.35, y: h * 0.4 };
  lm[45] = { x: w * 0.65, y: h * 0.4 };
  lm[48] = { x: w * 0.4, y: h * 0.6 };
  lm[54] = { x: w * 0.6, y: h * 0.6 };
  // eyes for EAR
  const open = openEyePoints();
  for (let i = 0; i < 6; i++) {
    lm[36 + i] = { x: w * 0.35 + open[i].x * 5, y: h * 0.4 + open[i].y * 5 };
    lm[42 + i] = { x: w * 0.55 + open[i].x * 5, y: h * 0.4 + open[i].y * 5 };
  }
  return lm;
}

async function testPoseMethod() {
  const lm = syntheticLandmarksFrontal();
  const result = await poseSolver.estimate(lm, 400, 400);
  assert.ok(result.metodo === "pnp" || result.metodo === "roll_only", "metodo válido");
  assert.ok(typeof result.confiante === "boolean");
  assert.ok(result.roll != null || result.metodo === "roll_only");

  const status = poseSolver.getOpenCvStatus();
  console.log(
    `POSE_GATE metodo=${result.metodo} confiante=${result.confiante} yaw=${result.yaw} pitch=${result.pitch} roll=${result.roll}`,
  );
  console.log(
    `POSE_GATE opencv.ready=${status.ready} failReason=${status.failReason || "none"}`,
  );

  if (result.metodo === "roll_only") {
    console.warn(
      "GATE WARNING: OpenCV/PnP não subiu — validação de pose sem yaw/pitch (não é caminho feliz).",
    );
    assert.strictEqual(result.yaw, null);
    assert.strictEqual(result.pitch, null);
    assert.strictEqual(result.confiante, false);
  } else {
    assert.ok(result.yaw != null && result.pitch != null, "PnP deve expor yaw/pitch");
  }
  console.log("PASS pose estimate gate");
}

async function main() {
  testEarOpenVsClosed();
  await testPoseMethod();
  console.log("ALL TESTS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
