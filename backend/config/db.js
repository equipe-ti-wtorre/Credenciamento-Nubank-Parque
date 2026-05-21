const mysql = require("mysql2");
const env = require("./env");

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  waitForConnections: true,
  connectionLimit: env.db.poolLimit,
  dateStrings: true,
  connectTimeout: env.db.connectTimeout,
});

module.exports = pool.promise();
