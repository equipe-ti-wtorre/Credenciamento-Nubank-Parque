#!/usr/bin/env node
/**
 * Consulta TEAMS_APP_ID no catálogo Graph após publicar o pacote.
 * Requer AppCatalog.Read.All (aplicação) no Azure OU upload já feito + permissão.
 *
 * Uso (a partir de teams-app/):
 *   node query-teams-app-id.mjs --tenant-ref-id 1
 */

import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../backend/package.json"),
);
const backendDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../backend");

process.chdir(backendDir);
require("dotenv").config({ path: path.join(backendDir, ".env") });

const db = require("./config/db");
const { decrypt } = require("./config/cryptoSecrets");
const { getApplicationToken, resolveTeamsCatalogAppId } = require("./utils/microsoftGraph");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const tenantRefId = Number(arg("--tenant-ref-id", "1"));
const externalId =
  arg("--external-id", process.env.TEAMS_APP_EXTERNAL_ID) ||
  "c8f4a2b1-6d3e-4f5a-9b0c-1e2d3f4a5b6c";

async function main() {
  const [rows] = await db.execute("SELECT * FROM azure_tenants WHERE id = ?", [
    tenantRefId,
  ]);
  const row = rows[0];
  if (!row?.ativo) {
    console.error("Tenant não encontrado ou inativo:", tenantRefId);
    process.exit(1);
  }

  const token = await getApplicationToken(
    row.azure_tenant_id,
    row.client_id,
    decrypt(row.client_secret_ciphertext),
  );
  if (!token) {
    console.error("Falha ao obter token OAuth.");
    process.exit(1);
  }

  console.log("Tenant:", row.nome);
  console.log("Client ID:", row.client_id);
  console.log("External ID (manifest):", externalId);

  const catalogId = await resolveTeamsCatalogAppId(token, {
    teamsAppId: null,
    externalId,
  });

  if (catalogId) {
    console.log("\nTEAMS_APP_ID=" + catalogId);
    console.log("\nAdicione ao backend/.env ou na integração Teams.");
    return;
  }

  console.log("\nApp ainda não encontrado no catálogo.");
  console.log("1. Envie credenciamento-teams.zip no Teams (ver README.md).");
  console.log("2. Opcional no Azure: permissão de APLICAÇÃO AppCatalog.Read.All + admin consent.");
  console.log("3. Execute este script novamente.");
  console.log("\nOu obtenha manualmente (Graph Explorer com admin):");
  console.log(
    `GET https://graph.microsoft.com/v1.0/appCatalogs/teamsApps?$filter=externalId eq '${externalId}'`,
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
