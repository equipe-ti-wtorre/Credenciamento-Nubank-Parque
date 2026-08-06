const express = require("express");
const db = require("../../config/db");
const env = require("../../config/env");
const packageJson = require("../../package.json");

const router = express.Router();

router.get("/", async (req, res) => {
  let dbStatus = "ok";
  try {
    await db.execute("SELECT 1");
  } catch {
    dbStatus = "error";
  }

  const status = dbStatus === "ok" ? "healthy" : "degraded";
  res.status(dbStatus === "ok" ? 200 : 503).json({
    status,
    db: dbStatus,
    appName: env.organizationName,
    version: packageJson.version,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  });
});

module.exports = router;
