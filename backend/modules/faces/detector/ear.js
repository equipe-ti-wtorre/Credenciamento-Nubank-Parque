/**
 * Eye Aspect Ratio (EAR) — Soukupová & Čech.
 * Índices iBUG-68 (0-based), confirmar contra face-api:
 *   olho esquerdo 36–41, olho direito 42–47.
 *
 * EAR = (‖P2−P6‖ + ‖P3−P5‖) / (2 · ‖P1−P4‖)
 * Escala-invariante; sensível a rotação e óculos.
 */

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * @param {Array<{x:number,y:number}>} pts - 6 pontos P1..P6
 */
function earFromSix(pts) {
  if (!pts || pts.length !== 6) return null;
  const [p1, p2, p3, p4, p5, p6] = pts;
  const denom = 2 * dist(p1, p4);
  if (denom < 1e-9) return null;
  return (dist(p2, p6) + dist(p3, p5)) / denom;
}

/**
 * @param {Array<{x:number,y:number}>} landmarks68
 * @returns {{ earEsq: number|null, earDir: number|null, earMedio: number|null }}
 */
function computeEar(landmarks68) {
  if (!Array.isArray(landmarks68) || landmarks68.length < 48) {
    return { earEsq: null, earDir: null, earMedio: null };
  }

  const left = landmarks68.slice(36, 42);
  const right = landmarks68.slice(42, 48);
  const earEsq = earFromSix(left);
  const earDir = earFromSix(right);

  let earMedio = null;
  if (earEsq != null && earDir != null) earMedio = (earEsq + earDir) / 2;
  else if (earEsq != null) earMedio = earEsq;
  else if (earDir != null) earMedio = earDir;

  return { earEsq, earDir, earMedio };
}

module.exports = {
  computeEar,
  earFromSix,
  dist,
};
