const env = require("./env");

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [env.db.name, table],
  );
  return rows.length > 0;
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [env.db.name, table, column],
  );
  return rows.length > 0;
}

async function allTablesExist(connection, tables) {
  for (const table of tables) {
    if (!(await tableExists(connection, table))) return false;
  }
  return true;
}

async function allColumnsExist(connection, table, columns) {
  for (const column of columns) {
    if (!(await columnExists(connection, table, column))) return false;
  }
  return true;
}

module.exports = {
  tableExists,
  columnExists,
  allTablesExist,
  allColumnsExist,
};
