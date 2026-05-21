const pino = require("pino");
const env = require("./env");

const logger = pino({
  level: env.logLevel,
  redact: {
    paths: [
      "password",
      "senha",
      "client_secret",
      "token",
      "refreshToken",
      "accessToken",
      "authorization",
      "req.headers.authorization",
    ],
    censor: "[REDACTED]",
  },
  transport:
    env.nodeEnv === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
});

function child(bindings) {
  return logger.child(bindings);
}

module.exports = { logger, child };
