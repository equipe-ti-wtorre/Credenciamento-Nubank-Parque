"use strict";

const ipaddr = require("ipaddr.js");

/**
 * Parse comma-separated IPv4/IPv6 list. Throws if a token is not a valid IP.
 * @param {string|null|undefined} raw
 * @returns {string[]}
 */
function parseIpList(raw) {
  const parts = String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    if (!ipaddr.isValid(part)) {
      throw new Error(`IP inválido em allowlist facial: ${part}`);
    }
    out.push(part);
  }
  return out;
}

/**
 * Canonical string for comparison (IPv4-mapped IPv6 → IPv4).
 * @param {string|null|undefined} ip
 * @returns {string|null}
 */
function normalizeIp(ip) {
  if (ip == null || String(ip).trim() === "") return null;
  try {
    const parsed = ipaddr.parse(String(ip).trim());
    if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
      return parsed.toIPv4Address().toString();
    }
    return parsed.toNormalizedString ? parsed.toNormalizedString() : parsed.toString();
  } catch {
    return null;
  }
}

/**
 * @param {string|null|undefined} clientIp
 * @param {string[]} allowlist
 */
function isClientIpAllowed(clientIp, allowlist) {
  if (!Array.isArray(allowlist) || allowlist.length === 0) return true;
  const client = normalizeIp(clientIp);
  if (!client) return false;
  return allowlist.some((allowed) => normalizeIp(allowed) === client);
}

module.exports = {
  parseIpList,
  normalizeIp,
  isClientIpAllowed,
};
