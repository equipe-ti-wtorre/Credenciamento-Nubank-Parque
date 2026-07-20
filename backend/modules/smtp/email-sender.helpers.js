const LIMITS = {
  perMinute: 30,
  perHour: 100,
  perDay: 2400,
};

const ACS_BATCH = {
  batchSize: 10,
  delayItemMs: 2000,
  delayBatchMs: 40000,
};

/** @type {number[]} timestamps of recent ACS sends (ms) */
const sendTimestamps = [];

function prune(now) {
  const dayAgo = now - 24 * 60 * 60 * 1000;
  while (sendTimestamps.length && sendTimestamps[0] < dayAgo) {
    sendTimestamps.shift();
  }
}

function countSince(now, windowMs) {
  const from = now - windowMs;
  let n = 0;
  for (let i = sendTimestamps.length - 1; i >= 0; i--) {
    if (sendTimestamps[i] >= from) n++;
    else break;
  }
  return n;
}

function msUntilSlot(now) {
  prune(now);
  const windows = [
    { limit: LIMITS.perMinute, ms: 60 * 1000 },
    { limit: LIMITS.perHour, ms: 60 * 60 * 1000 },
    { limit: LIMITS.perDay, ms: 24 * 60 * 60 * 1000 },
  ];

  let waitMs = 0;
  let motivo = null;

  for (const w of windows) {
    const count = countSince(now, w.ms);
    if (count >= w.limit) {
      const oldestInWindow = sendTimestamps[sendTimestamps.length - count];
      const until = oldestInWindow + w.ms - now + 50;
      if (until > waitMs) {
        waitMs = until;
        if (w.ms === 60 * 1000) motivo = "limite_minuto";
        else if (w.ms === 60 * 60 * 1000) motivo = "limite_hora";
        else motivo = "limite_dia";
      }
    }
  }

  return { waitMs: Math.max(0, waitMs), motivo };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until ACS rate limit allows another send.
 * @param {(enviarEm: Date, waitMs: number, motivo: string|null) => void|Promise<void>} [onAcsWait]
 */
async function acsRateLimit(onAcsWait) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now();
    const { waitMs, motivo } = msUntilSlot(now);
    if (waitMs <= 0) {
      sendTimestamps.push(Date.now());
      prune(Date.now());
      return;
    }
    const enviarEm = new Date(now + waitMs);
    if (typeof onAcsWait === "function") {
      await onAcsWait(enviarEm, waitMs, motivo);
    }
    await sleep(waitMs);
  }
}

/**
 * Apply ocultar_para: real recipient in BCC, To = sender.
 */
function applyOcultarPara({ to, from, ocultarPara }) {
  if (!ocultarPara) {
    return { to, bcc: undefined };
  }
  return {
    to: from,
    bcc: to,
  };
}

/**
 * Strip HTML tags for ACS plainText fallback.
 */
function htmlToPlainText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Send items in batches with ACS-friendly delays.
 * @param {Array} items
 * @param {(item: any, index: number) => Promise<any>} sendFn
 * @param {object} [opts]
 * @param {boolean} [opts.isAcs]
 */
async function sendMailBatched(items, sendFn, opts = {}) {
  const isAcs = !!opts.isAcs;
  const batchSize = isAcs ? ACS_BATCH.batchSize : opts.batchSize || 20;
  const delayItem = isAcs ? ACS_BATCH.delayItemMs : opts.delayItemMs || 0;
  const delayBatch = isAcs ? ACS_BATCH.delayBatchMs : opts.delayBatchMs || 0;

  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    for (let j = 0; j < batch.length; j++) {
      const result = await sendFn(batch[j], i + j);
      results.push(result);
      if (delayItem > 0 && j < batch.length - 1) {
        await sleep(delayItem);
      }
    }
    if (delayBatch > 0 && i + batchSize < items.length) {
      await sleep(delayBatch);
    }
  }
  return results;
}

module.exports = {
  LIMITS,
  ACS_BATCH,
  acsRateLimit,
  applyOcultarPara,
  htmlToPlainText,
  sendMailBatched,
  sleep,
};
