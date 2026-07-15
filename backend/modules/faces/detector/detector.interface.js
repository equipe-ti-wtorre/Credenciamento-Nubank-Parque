/**
 * Contrato do detector facial (só detecção + landmarks).
 * Sem reconhecimento, embedding ou integração com equipamento.
 *
 * @typedef {{ x: number, y: number }} Point2D
 * @typedef {{ x: number, y: number, width: number, height: number }} FaceBox
 * @typedef {{ box: FaceBox, landmarks68: Point2D[], score?: number }} DetectedFace
 * @typedef {{ faces: DetectedFace[], imageWidth: number, imageHeight: number }} DetectionResult
 *
 * @typedef {object} FaceDetector
 * @property {() => Promise<void>} init
 * @property {(imageBuffer: Buffer) => Promise<DetectionResult>} detect
 */

module.exports = {};
