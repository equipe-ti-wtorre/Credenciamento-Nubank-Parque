const db = require("../config/db");
const { UUID_RE, formatUuid, isSafeIdent } = require("../utils/publicId");

function notFound(res, req) {
  return res.status(404).json({
    message: "Registro não encontrado.",
    requestId: req.requestId,
  });
}

/**
 * Resolve public_id da URL para o id interno.
 * UUID inválido ou inexistente → 404, sem distinguir os dois casos.
 * req.params[param] passa a ser o id numérico para os controllers atuais.
 * A linha fica em req.recurso (param "id") e em req.recursos[param].
 */
function resolverPublicId({ param = "id", table, pk, attach } = {}) {
  if (!isSafeIdent(table) || !isSafeIdent(pk) || !isSafeIdent(param)) {
    throw new Error("resolverPublicId: identificador de tabela inválido.");
  }

  return async function resolverPublicIdMiddleware(req, res, next) {
    try {
      if (req.params == null || req.params[param] == null || req.params[param] === "") {
        return next();
      }
      const raw = String(req.params[param]).trim();
      if (!UUID_RE.test(raw)) return notFound(res, req);

      const [rows] = await db.execute(
        `SELECT * FROM \`${table}\` WHERE public_id = ? LIMIT 1`,
        [raw],
      );
      if (!rows.length) return notFound(res, req);

      const row = rows[0];
      row.public_id = formatUuid(row.public_id);
      const slot = attach || param;
      req.recursos = req.recursos || {};
      req.recursos[slot] = row;
      if (param === "id" || slot === "recurso") req.recurso = row;
      req.params[param] = String(row[pk]);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { resolverPublicId };
