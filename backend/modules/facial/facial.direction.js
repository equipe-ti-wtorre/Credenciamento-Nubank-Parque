"use strict";

/**
 * Direção do evento facial: payload.direcao ou prefixo do deviceId.
 * entrada → CHECK_IN; saida → CHECK_OUT.
 */

function normalizeToken(value) {
  return value != null ? String(value).trim().toLowerCase() : "";
}

function stripAccents(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function inferDirectionFromDevice(deviceId) {
  const text = stripAccents(normalizeToken(deviceId));
  if (!text) return null;
  if (text.startsWith("entrada-")) return "entrada";
  if (text.startsWith("saida-")) return "saida";
  const hasSaida = /(^|[^a-z])saida([^a-z]|$)/.test(text);
  const hasEntrada = /(^|[^a-z])entrada([^a-z]|$)/.test(text);
  if (hasSaida && !hasEntrada) return "saida";
  if (hasEntrada && !hasSaida) return "entrada";
  return null;
}

function resolveAccessDirection(payload) {
  const direcao = stripAccents(normalizeToken(payload?.direcao));
  if (direcao === "entrada" || direcao === "saida") return direcao;
  return inferDirectionFromDevice(payload?.deviceId);
}

function directionToGateAction(direcao) {
  if (direcao === "entrada") return "CHECK_IN";
  if (direcao === "saida") return "CHECK_OUT";
  return null;
}

function shouldApplyFacialGate({ duplicate, blocked, collaboratorId, direcao }) {
  if (duplicate || blocked) return false;
  if (!collaboratorId) return false;
  return direcao === "entrada" || direcao === "saida";
}

module.exports = {
  resolveAccessDirection,
  directionToGateAction,
  shouldApplyFacialGate,
};
