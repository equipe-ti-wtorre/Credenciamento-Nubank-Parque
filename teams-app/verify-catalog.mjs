#!/usr/bin/env node
/** Verifica versão e RSC do app publicado no tenant. */
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
const {
  getApplicationToken,
  getTeamsCatalogAppStatus,
} = require("./utils/microsoftGraph");

const appId = process.argv[2] || process.env.TEAMS_APP_ID || "7ba5b35a-67b1-4877-b65f-f0e17c373c2f";

async function main() {
  const [rows] = await db.execute("SELECT * FROM azure_tenants WHERE id = 1");
  const row = rows[0];
  const token = await getApplicationToken(
    row.azure_tenant_id,
    row.client_id,
    decrypt(row.client_secret_ciphertext),
  );
  if (!token) {
    console.error("Token vazio — verifique client secret do tenant.");
    process.exit(1);
  }
  const s = await getTeamsCatalogAppStatus(token, appId);
  console.log(JSON.stringify(s, null, 2));
  if (s.ok && !s.hasSendUserRsc) {
    console.log("\nAção: publique credenciamento-teams.zip 1.0.2 e reinstale o app.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
