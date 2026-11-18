const express = require("express");
const db = require("../../config/db");
const env = require("../../config/env");
const packageJson = require("../../package.json");
const { authMiddleware } = require("../../middleware/authMiddleware");

const router = express.Router();

async function checkDb() {
  try {
    await db.execute("SELECT 1");
    return "ok";
  } catch {
    return "error";
  }
}

/** Público (monitoramento): só o estado, sem ambiente, versão nem URL. */
router.get("/", async (req, res) => {
  const dbStatus = await checkDb();
  res.status(dbStatus === "ok" ? 200 : 503).json({
    status: dbStatus === "ok" ? "healthy" : "degraded",
    db: dbStatus,
  });
});

/** Detalhes para a tela "Sobre" (usuário logado). */
router.get("/details", authMiddleware, async (req, res) => {
  const dbStatus = await checkDb();
  res.status(dbStatus === "ok" ? 200 : 503).json({
    status: dbStatus === "ok" ? "healthy" : "degraded",
    db: dbStatus,
    appName: env.organizationName,
    version: packageJson.version,
    environment: env.nodeEnv,
    publicUrl: env.appPublicUrl || null,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  });
});

module.exports = router;
