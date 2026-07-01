#!/usr/bin/env node
/**
 * Gera color.png, outline.png, manifest.json e credenciamento-teams.zip
 *
 * Uso:
 *   node build-package.mjs
 *   node build-package.mjs --client-id 90ac8301-... --base-url https://cred.allianzparque.intra
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const clientId =
  arg("--client-id", process.env.TEAMS_AAD_CLIENT_ID) ||
  "90ac8301-8401-4287-9e69-287a4cdcbc2b";
const baseUrl =
  arg("--base-url", process.env.TEAMS_APP_BASE_URL) ||
  "https://cred.allianzparque.intra";
const packageExternalId =
  arg("--external-id", process.env.TEAMS_APP_EXTERNAL_ID) ||
  "c8f4a2b1-6d3e-4f5a-9b0c-1e2d3f4a5b6c";
const orgName = process.env.ORGANIZATION_NAME || "Credenciamento";

let hostname;
try {
  hostname = new URL(baseUrl).hostname;
} catch {
  console.error("URL inválida:", baseUrl);
  process.exit(1);
}

const manifest = {
  $schema:
    "https://developer.microsoft.com/json-schemas/teams/v1.16/MicrosoftTeams.schema.json",
  manifestVersion: "1.16",
  version: "1.0.2",
  id: packageExternalId,
  packageName: "com.credenciamento.app",
  developer: {
    name: orgName,
    websiteUrl: baseUrl,
    privacyUrl: `${baseUrl}/`,
    termsOfUseUrl: `${baseUrl}/`,
  },
  name: {
    short: "Credenciamento",
    full: `${orgName} Credenciamento`,
  },
  description: {
    short: "Notificações do credenciamento",
    full: "Alertas do sistema de credenciamento no feed de atividades do Teams.",
  },
  icons: {
    color: "color.png",
    outline: "outline.png",
  },
  accentColor: "#2563EB",
  staticTabs: [
    {
      entityId: "home",
      name: "Início",
      contentUrl: baseUrl,
      websiteUrl: baseUrl,
      scopes: ["personal"],
    },
  ],
  permissions: ["identity"],
  authorization: {
    permissions: {
      resourceSpecific: [
        {
          name: "TeamsActivity.Send.User",
          type: "Application",
        },
      ],
    },
  },
  validDomains: [hostname],
  webApplicationInfo: {
    id: clientId,
    resource: `api://${clientId}`,
  },
  activities: {
    activityTypes: [
      {
        type: "credenciamentoAlert",
        description: "Alerta do credenciamento",
        templateText: "{actor}: {message}",
      },
    ],
  },
};

execSync("python3 generate-icons.py", { cwd: __dirname, stdio: "inherit" });

const manifestPath = path.join(__dirname, "manifest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const zipPath = path.join(__dirname, "..", "credenciamento-teams.zip");
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

execSync(
  `zip -j "${zipPath}" manifest.json color.png outline.png`,
  { cwd: __dirname, stdio: "inherit" },
);

const info = {
  clientId,
  baseUrl,
  packageExternalId,
  zipPath,
  azureAppIdUri: `api://${clientId}`,
};

fs.writeFileSync(
  path.join(__dirname, "build-info.json"),
  `${JSON.stringify(info, null, 2)}\n`,
);

console.log("\nPacote gerado:");
console.log(JSON.stringify(info, null, 2));
console.log("\nPróximo passo: enviar credenciamento-teams.zip no Teams (upload personalizado ou admin).");
