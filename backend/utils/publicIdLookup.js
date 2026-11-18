const db = require("../config/db");
const { formatUuid, isSafeIdent } = require("./publicId");

async function lookupPublicId(table, pk, id) {
  if (id == null || id === "") return null;
  if (!isSafeIdent(table) || !isSafeIdent(pk)) return null;
  const [rows] = await db.execute(
    `SELECT CAST(public_id AS CHAR) AS public_id FROM \`${table}\` WHERE \`${pk}\` = ? LIMIT 1`,
    [id],
  );
  return formatUuid(rows[0]?.public_id);
}

module.exports = { lookupPublicId };
