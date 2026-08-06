#!/usr/bin/env node
/**
 * CLI de validação facial em lote (CSV retomável).
 *
 * Uso:
 *   node scripts/validate-face-photos.js --dir ./fotos --out ./out/faces.csv
 *   node scripts/validate-face-photos.js --db --out ./out/faces.csv [--limit 100]
 *
 * Idempotente: pula pessoa_id já presente no CSV de saída.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const { validarFoto } = require("../modules/faces/facial.validator");

const CHECK_IDS = [
  "quantidade_rostos",
  "centralizacao",
  "margem_rosto",
  "tamanho_rosto",
  "pose_frontal",
  "nitidez",
  "iluminacao",
  "oculos_escuros",
  "olhos_abertos",
  "testa_visivel",
  "mascara",
  "formato",
  "resolucao_dahua",
  "arquivo_dahua",
  "arquivo_controlid",
];

function parseArgs(argv) {
  const args = {
    dir: null,
    out: path.join(process.cwd(), "storage", "face-validation.csv"),
    db: false,
    limit: null,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") args.dir = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--db") args.db = true;
    else if (a === "--limit") args.limit = Number(argv[++i]) || null;
    else if (a === "--dry-run") args.dryRun = true;
  }
  return args;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function headerLine() {
  return ["pessoa_id", "apto_controlid", "apto_dahua", ...CHECK_IDS].join(",");
}

function loadDoneIds(outPath) {
  const done = new Set();
  if (!fs.existsSync(outPath)) return done;
  const text = fs.readFileSync(outPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (let i = 1; i < lines.length; i++) {
    const id = lines[i].split(",")[0];
    if (id) done.add(id);
  }
  return done;
}

function rowFor(pessoaId, report) {
  const byId = Object.fromEntries((report.checagens || []).map((c) => [c.id, c]));
  const cols = [
    pessoaId,
    report.apto?.controlid ? "1" : "0",
    report.apto?.dahua ? "1" : "0",
  ];
  for (const id of CHECK_IDS) {
    const c = byId[id];
    if (!c) {
      cols.push("");
      continue;
    }
    const medido =
      typeof c.medido === "object" ? JSON.stringify(c.medido) : c.medido;
    cols.push(`${c.status}|${medido == null ? "" : medido}`);
  }
  return cols.map(csvEscape).join(",");
}

async function listFromDir(dir) {
  const entries = fs.readdirSync(dir);
  const items = [];
  for (const name of entries) {
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) continue;
    const ext = path.extname(name).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext)) continue;
    const id = path.basename(name, ext);
    items.push({ id, filePath: full });
  }
  return items;
}

async function listFromDb() {
  const db = require("../config/db");
  const picturesDir = path.join(__dirname, "../storage/pictures");
  const [rows] = await db.execute(
    `SELECT id_collaborator, picture FROM collaborator
     WHERE picture IS NOT NULL AND picture <> ''
     ORDER BY id_collaborator ASC`,
  );
  return rows.map((r) => ({
    id: String(r.id_collaborator),
    filePath: path.join(picturesDir, path.basename(r.picture)),
  }));
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.dir && !args.db) {
    console.error("Informe --dir <pasta> ou --db");
    process.exit(1);
  }

  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const done = loadDoneIds(outPath);
  if (!fs.existsSync(outPath)) {
    fs.writeFileSync(outPath, `${headerLine()}\n`, "utf8");
  }

  let items = args.db ? await listFromDb() : await listFromDir(path.resolve(args.dir));
  if (args.limit) items = items.slice(0, args.limit);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of items) {
    if (done.has(item.id)) {
      skipped += 1;
      continue;
    }
    if (!fs.existsSync(item.filePath)) {
      console.warn(`[skip missing] ${item.id} ${item.filePath}`);
      errors += 1;
      continue;
    }

    try {
      const buf = fs.readFileSync(item.filePath);
      if (args.dryRun) {
        console.log(`[dry-run] ${item.id}`);
        processed += 1;
        continue;
      }
      const report = await validarFoto(buf, { includeMeta: true });
      fs.appendFileSync(outPath, `${rowFor(item.id, report)}\n`, "utf8");
      done.add(item.id);
      processed += 1;
      const poseMetodo = report.meta?.pose?.metodo || "?";
      console.log(
        `[ok] ${item.id} controlid=${report.apto.controlid} dahua=${report.apto.dahua} pose=${poseMetodo}`,
      );
    } catch (err) {
      errors += 1;
      console.error(`[err] ${item.id}: ${err.message}`);
    }
  }

  console.log(
    JSON.stringify({ processed, skipped, errors, out: outPath }, null, 2),
  );
  process.exit(errors && processed === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
