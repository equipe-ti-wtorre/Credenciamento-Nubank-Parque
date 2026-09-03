#!/usr/bin/env node
"use strict";

/**
 * Envia comando enroll de teste para facial-commands.
 *
 * Uso:
 *   node scripts/facial-mock-send-command.js --collaborator-id 1 --photo ./storage/pictures/x.jpg
 *   node scripts/facial-mock-send-command.js --collaborator-id 1 --revoke
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const facialCommand = require("../modules/facial/facial.command.service");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[name] = next;
      i += 1;
    } else {
      args[name] = true;
    }
  }
  return args;
}

async function loadCollaborator(id) {
  const [rows] = await db.execute(
    `SELECT id_collaborator, name, picture FROM collaborator WHERE id_collaborator = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function main() {
  const args = parseArgs(process.argv);
  const collaboratorId = Number(args["collaborator-id"] || args.id);
  if (!collaboratorId) {
    console.error("Informe --collaborator-id");
    process.exit(1);
  }

  const row = await loadCollaborator(collaboratorId);
  if (!row) {
    console.error("Colaborador não encontrado:", collaboratorId);
    process.exit(1);
  }

  if (args.revoke) {
    const result = await facialCommand.sendRevoke(collaboratorId);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  let photoPath = args.photo;
  if (!photoPath && row.picture) {
    photoPath = path.join(__dirname, "../storage/pictures", row.picture);
  }
  if (!photoPath || !fs.existsSync(photoPath)) {
    console.error("Informe --photo ou cadastre foto no colaborador.");
    process.exit(1);
  }

  const buffer = fs.readFileSync(photoPath);
  const result = await facialCommand.sendEnrollSafe(row, buffer);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
