"use strict";

const cron = require("node-cron");
const { child } = require("../config/logger");
const env = require("../config/env");
const { captureError } = require("../modules/error-logs/error-logs.helpers");

const logger = child({ module: "external-company-enrich-cron" });

let scheduledTask = null;
let running = false;

/**
 * Stub: enriquecimento via BrasilAPI.
 * Nunca roda no caminho do request. Flag default false.
 * Só chama HTTP se EXTERNAL_COMPANY_ENRICH=true (saída HTTPS confirmada pelo operador).
 */
async function runExternalCompanyEnrich({ triggeredBy = "manual" } = {}) {
  if (!env.externalCompanyEnrichEnabled) {
    return { skipped: true, ok: true, updated: 0 };
  }
  if (running) return { alreadyRunning: true, ok: true, updated: 0 };
  running = true;
  try {
    const db = require("../config/db");
    const [rows] = await db.execute(
      `SELECT id_external_company, cnpj FROM external_company
        WHERE revisado = 0 AND origem <> 'MANUAL' AND cnpj IS NOT NULL
        LIMIT 20`,
    );
    let updated = 0;
    for (const row of rows) {
      const url = `https://brasilapi.com.br/api/cnpj/v1/${row.cnpj}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      await db.execute(
        `UPDATE external_company
            SET legal_name = COALESCE(NULLIF(?, ''), legal_name),
                municipio = COALESCE(NULLIF(?, ''), municipio),
                uf = COALESCE(NULLIF(?, ''), uf),
                cep = COALESCE(NULLIF(?, ''), cep),
                endereco = COALESCE(NULLIF(?, ''), endereco)
          WHERE id_external_company = ? AND revisado = 0`,
        [
          data.razao_social || data.nome || null,
          data.municipio || null,
          data.uf || null,
          String(data.cep || "").replace(/\D/g, "").slice(0, 8) || null,
          [data.logradouro, data.numero, data.bairro].filter(Boolean).join(", ") || null,
          row.id_external_company,
        ],
      );
      updated += 1;
    }
    logger.info({ triggeredBy, updated }, "Enriquecimento BrasilAPI concluído");
    return { skipped: false, ok: true, updated };
  } catch (err) {
    logger.error({ err, triggeredBy }, "Falha no enriquecimento de empresas eventuais");
    await captureError(err, {
      module: "external-company-enrich",
      origin: "job",
      metadata: { triggeredBy },
    });
    return { skipped: false, ok: false, updated: 0, error: err.message };
  } finally {
    running = false;
  }
}

function startExternalCompanyEnrichCron() {
  if (!env.externalCompanyEnrichEnabled) return;
  if (scheduledTask) scheduledTask.stop();
  scheduledTask = cron.schedule("20 3 * * *", () => {
    void runExternalCompanyEnrich({ triggeredBy: "cron" });
  });
  logger.info("Cron de enriquecimento de empresas eventuais registrada");
}

module.exports = {
  runExternalCompanyEnrich,
  startExternalCompanyEnrichCron,
};
