const { MAX_METADATA_BYTES } = require("./audit.constants");

function buildAuditMetadata({
  event,
  outcome,
  resource = null,
  changes = null,
  http = null,
  provider = null,
  reason = null,
  loginHint = null,
  extra = null,
} = {}) {
  const metadata = {};

  if (event) metadata.event = event;
  if (outcome) metadata.outcome = outcome;
  if (resource) metadata.resource = resource;
  if (changes != null) metadata.changes = changes;
  if (http) metadata.http = http;
  if (provider) metadata.provider = provider;
  if (reason) metadata.reason = reason;
  if (loginHint) metadata.loginHint = loginHint;
  if (extra && typeof extra === "object") {
    Object.assign(metadata, extra);
  }

  return metadata;
}

function buildHttpContext(req, { statusCode, durationMs } = {}) {
  return {
    method: req?.method || null,
    path: req?.originalUrl?.split("?")[0] || req?.url || null,
    status: statusCode ?? null,
    durationMs: durationMs ?? null,
  };
}

function maskLoginHint(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (s.length <= 2) return "**";
  if (s.includes("@")) {
    const [local, domain] = s.split("@");
    const maskedLocal =
      local.length <= 2 ? "**" : `${local[0]}***${local[local.length - 1]}`;
    return `${maskedLocal}@${domain}`;
  }
  return `${s[0]}***${s[s.length - 1]}`;
}

function normalizeMetadata(metadata) {
  if (metadata == null) return null;
  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return { raw: metadata };
    }
  }
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return { value: metadata };
  }
  return metadata;
}

function truncateMetadata(metadata) {
  const normalized = normalizeMetadata(metadata);
  if (!normalized) return null;

  let json = JSON.stringify(normalized);
  if (Buffer.byteLength(json, "utf8") <= MAX_METADATA_BYTES) {
    return normalized;
  }

  const trimmed = { ...normalized, _truncated: true };
  delete trimmed.changes;
  delete trimmed.extra;

  json = JSON.stringify(trimmed);
  if (Buffer.byteLength(json, "utf8") <= MAX_METADATA_BYTES) {
    return trimmed;
  }

  return {
    event: trimmed.event || null,
    outcome: trimmed.outcome || null,
    _truncated: true,
    _note: "metadata exceeded size limit",
  };
}

module.exports = {
  buildAuditMetadata,
  buildHttpContext,
  maskLoginHint,
  normalizeMetadata,
  truncateMetadata,
};
