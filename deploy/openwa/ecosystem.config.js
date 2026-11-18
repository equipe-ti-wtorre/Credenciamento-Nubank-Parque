/**
 * PM2 — OpenWA (gateway WhatsApp) rodando do fonte, sem Docker.
 *
 * Uso: pm2 start /www/wwwroot/Credenciamento/deploy/openwa/ecosystem.config.js && pm2 save
 *
 * O OpenWA lê o .env do próprio diretório (cwd), então basta manter
 * /www/wwwroot/openwa/.env preenchido (veja .env.example ao lado).
 */
const path = require("path");

const OPENWA_DIR = process.env.OPENWA_DIR || "/www/wwwroot/openwa";

module.exports = {
  apps: [
    {
      name: "openwa",
      cwd: OPENWA_DIR,
      script: path.join(OPENWA_DIR, "dist/main.js"),
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      // Chromium headless + Nest: ~300-500 MB por sessão. Reinicia se vazar.
      max_memory_restart: "900M",
      restart_delay: 5000,
      max_restarts: 20,
      kill_timeout: 15000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
      out_file: path.join(OPENWA_DIR, "logs/pm2-out.log"),
      error_file: path.join(OPENWA_DIR, "logs/pm2-error.log"),
      merge_logs: true,
    },
  ],
};
