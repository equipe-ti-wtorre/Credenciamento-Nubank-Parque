#!/usr/bin/env node
"use strict";

/**
 * Simula status enrollment-status (gateway → Credenciamento worker).
 *
 * Uso:
 *   node scripts/facial-mock-send-status.js --collaborator-id 1 --overall synced
 *   node scripts/facial-mock-send-status.js --collaborator-id 1 --overall failed --command revoke
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { v4: uuidv4 } = require("uuid");
const {
  STATUS_ENROLLMENT,
  COMMAND_ENROLL,
  COMMAND_REVOKE,
  buildLinkedId,
  buildUserId,
  DEVICE_IDS,
} = require("../modules/facial/facial.contract");
const enrollmentService = require("../modules/facial/facial.enrollment.service");
const { parseEnrollmentStatus } = require("../modules/facial/facial.contract");

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

async function main() {
  const args = parseArgs(process.argv);
  const collaboratorId = Number(args["collaborator-id"] || args.id);
  if (!collaboratorId) {
    console.error("Informe --collaborator-id");
    process.exit(1);
  }

  const overall = args.overall || "synced";
  const command = args.command === "revoke" ? COMMAND_REVOKE : COMMAND_ENROLL;

  const devices = {};
  for (const deviceId of DEVICE_IDS) {
    devices[deviceId] = { status: overall === "partial" && deviceId.endsWith("02") ? "failed" : overall };
  }

  const body = {
    type: STATUS_ENROLLMENT,
    correlationId: args.correlation || uuidv4(),
    linkedId: buildLinkedId(collaboratorId),
    userId: buildUserId(collaboratorId),
    command,
    overallStatus: overall,
    devices,
    timestamp: new Date().toISOString(),
  };

  const parsed = parseEnrollmentStatus(body);
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exit(1);
  }

  const result = await enrollmentService.applyEnrollmentStatus(parsed);
  console.log(JSON.stringify({ body, result }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
