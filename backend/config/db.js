const mysql = require("mysql2");
const env = require("./env");
const { logger } = require("./logger");

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

pool.on("connection", (connection) => {
  connection.query("SET SESSION time_zone = ?", [env.db.timezone], (err) => {
    if (err) {
      logger.error({ err, timezone: env.db.timezone }, "Falha ao configurar timezone MySQL");
    }
  });
});

const promisePool = pool.promise();
const originalGetConnection = promisePool.getConnection.bind(promisePool);

promisePool.getConnection = () =>
  Promise.race([
    originalGetConnection(),
    new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(`Timeout ao obter conexão MySQL (${env.db.acquireTimeout}ms)`),
          ),
        env.db.acquireTimeout,
      );
    }),
  ]);

module.exports = promisePool;
