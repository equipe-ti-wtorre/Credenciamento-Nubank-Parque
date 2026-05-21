const cors = require("cors");
const env = require("./env");

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (!env.isProduction) {
      return callback(null, true);
    }
    callback(new Error("Origem não permitida pelo CORS"));
  },
  credentials: true,
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Request-Id",
    "X-Client-Type",
  ],
  exposedHeaders: ["X-Request-Id"],
};

module.exports = cors(corsOptions);
