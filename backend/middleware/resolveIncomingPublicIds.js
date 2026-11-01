const db = require("../config/db");
const { FIELD_BY_KEY, PLURAL_KEYS, UUID_RE, isSafeIdent } = require("../utils/publicId");

function notFound(res, req) {
  return res.status(404).json({
    message: "Registro não encontrado.",
    requestId: req.requestId,
  });
}

async function toInternalId(spec, raw) {
  if (raw == null || raw === "") return raw;
  const value = String(raw).trim();
  if (!UUID_RE.test(value)) {
    const err = new Error("not-found");
    err.statusCode = 404;
    throw err;
  }
  if (!isSafeIdent(spec.table) || !isSafeIdent(spec.pk)) {
    const err = new Error("not-found");
    err.statusCode = 404;
    throw err;
  }
  const [rows] = await db.execute(
    `SELECT \`${spec.pk}\` AS pk FROM \`${spec.table}\` WHERE public_id = ? LIMIT 1`,
    [value],
  );
  if (!rows.length) {
    const err = new Error("not-found");
    err.statusCode = 404;
    throw err;
  }
  return Number(rows[0].pk);
}

function specForKey(key) {
  if (FIELD_BY_KEY.has(key) && FIELD_BY_KEY.get(key).table) {
    const spec = FIELD_BY_KEY.get(key);
    if (spec.ownRank >= 200) return null;
    return { spec, plural: false };
  }
  if (PLURAL_KEYS[key] && FIELD_BY_KEY.has(PLURAL_KEYS[key])) {
    return { spec: FIELD_BY_KEY.get(PLURAL_KEYS[key]), plural: true };
  }
  return null;
}

async function convertNode(node) {
  if (Array.isArray(node)) {
    for (const item of node) await convertNode(item);
    return;
  }
  if (!node || typeof node !== "object" || Buffer.isBuffer(node)) return;

  const entries = Object.entries(node);
  for (const [key, value] of entries) {
    if (key.endsWith("_public_id") && key !== "public_id" && value != null && value !== "") {
      const spec = [...FIELD_BY_KEY.values()].find((item) => item.out === key);
      if (spec) {
        if (Array.isArray(value)) {
          const next = [];
          for (const item of value) {
            if (item == null || item === "") continue;
            next.push(await toInternalId(spec, item));
          }
          node[spec.key] = next;
        } else {
          node[spec.key] = await toInternalId(spec, value);
        }
        delete node[key];
        continue;
      }
    }
    const found = specForKey(key);
    if (found && value != null && value !== "" && value !== 0 && value !== "0") {
      if (found.plural || Array.isArray(value)) {
        if (!Array.isArray(value)) {
          const err = new Error("not-found");
          err.statusCode = 404;
          throw err;
        }
        const next = [];
        for (const item of value) {
          if (item == null || item === "") continue;
          next.push(await toInternalId(found.spec, item));
        }
        node[key] = next;
      } else if (typeof value === "string" || typeof value === "number") {
        node[key] = await toInternalId(found.spec, value);
      }
      continue;
    }
    if (value && typeof value === "object") await convertNode(value);
  }
}

function resolveIncomingPublicIds(req, res, next) {
  Promise.resolve()
    .then(async () => {
      if (req.body && typeof req.body === "object") await convertNode(req.body);
      if (req.query && typeof req.query === "object") await convertNode(req.query);
    })
    .then(() => next())
    .catch((err) => {
      if (err && err.statusCode === 404) return notFound(res, req);
      return next(err);
    });
}

module.exports = resolveIncomingPublicIds;
