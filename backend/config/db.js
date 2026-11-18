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
const { injectPublicId } = require("../utils/publicId");

const LIMIT_PARAM_RE = /\b(?:LIMIT|OFFSET)\s+\?/i;

function wrapPublicId(executor) {
  if (!executor || executor.__publicIdWrapped) return executor;
  const origExecute = executor.execute.bind(executor);
  const origQuery = executor.query.bind(executor);

  function apply(orig, sql, values, cb) {
    if (typeof sql !== "string" || typeof values === "function") {
      return orig(sql, values, cb);
    }
    const next = injectPublicId(sql, values);
    if (typeof cb === "function") return orig(next.sql, next.values, cb);
    return orig(next.sql, next.values);
  }

  // MySQL 8 recusa LIMIT/OFFSET como parâmetro de prepared statement ("Incorrect arguments to
  // mysqld_stmt_execute"); nesses casos usa query(), que também escapa os valores.
  executor.execute = function executeWithPublicId(sql, values, cb) {
    const orig = typeof sql === "string" && LIMIT_PARAM_RE.test(sql) ? origQuery : origExecute;
    return apply(orig, sql, values, cb);
  };
  executor.query = function queryWithPublicId(sql, values, cb) {
    return apply(origQuery, sql, values, cb);
  };
  executor.__publicIdWrapped = true;
  return executor;
}

wrapPublicId(promisePool);

promisePool.getConnection = () =>
  Promise.race([
    originalGetConnection().then((conn) => wrapPublicId(conn)),
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
