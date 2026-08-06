/**
 * Gera 100 colaboradores de teste (distribuídos entre empresas ativas).
 * Veículos: só com --with-vehicles.
 * Uso: node scripts/seed-test-collaborators-vehicles.js
 *      node scripts/seed-test-collaborators-vehicles.js --with-vehicles
 */
require("dotenv").config();
const db = require("../config/db");
const { isValidCpf } = require("../utils/cpf");
const { isValidPlate, normalizePlate } = require("../utils/plate");

const COUNT = 100;
const DOC_TYPE_CPF = 1;
const withVehicles = process.argv.includes("--with-vehicles");

const FIRST_NAMES = [
  "Ana", "Bruno", "Carla", "Diego", "Elena", "Felipe", "Gabriela", "Hugo",
  "Isabela", "João", "Karina", "Lucas", "Marina", "Nicolas", "Olivia", "Pedro",
  "Queila", "Rafael", "Sofia", "Thiago", "Ursula", "Vitor", "Wagner", "Xavier",
  "Yasmin", "Zeca", "Alice", "Bernardo", "Camila", "Daniel", "Eduarda", "Fernando",
  "Giovana", "Henrique", "Ingrid", "José", "Larissa", "Mateus", "Natália", "Otávio",
  "Paula", "Renato", "Sabrina", "Tiago", "Vanessa", "William", "Amanda", "Caio",
  "Débora", "Enzo",
];

const LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves",
  "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho",
  "Rocha", "Almeida", "Nascimento", "Araújo", "Melo", "Barbosa", "Cardoso",
  "Teixeira", "Dias", "Castro", "Campos", "Moreira", "Cunha", "Pinto",
  "Vieira", "Moura",
];

const BRANDS = [
  { brand: "Volkswagen", models: ["Gol", "Polo", "Virtus", "T-Cross", "Saveiro"] },
  { brand: "Fiat", models: ["Argo", "Cronos", "Strada", "Toro", "Mobi"] },
  { brand: "Chevrolet", models: ["Onix", "Tracker", "S10", "Spin", "Montana"] },
  { brand: "Toyota", models: ["Corolla", "Hilux", "Yaris", "SW4", "Corolla Cross"] },
  { brand: "Honda", models: ["Civic", "City", "HR-V", "Fit", "WR-V"] },
  { brand: "Hyundai", models: ["HB20", "Creta", "Tucson", "i30", "Venue"] },
  { brand: "Renault", models: ["Kwid", "Sandero", "Logan", "Duster", "Oroch"] },
  { brand: "Ford", models: ["Ka", "Ranger", "Territory", "Maverick", "EcoSport"] },
  { brand: "Jeep", models: ["Renegade", "Compass", "Commander", "Wrangler"] },
  { brand: "Nissan", models: ["Kicks", "Versa", "Frontier", "Sentra"] },
];

const COLORS = ["Branco", "Preto", "Prata", "Cinza", "Vermelho", "Azul", "Verde", "Bege"];
const TYPES = ["Passeio", "Utilitário", "Carga", "Van", "Motocicleta"];

function generateValidCpf(seed) {
  // Gera CPF determinístico e válido a partir de um seed (evita colisão com CPF real comum)
  const base = String(900000000 + seed).padStart(9, "0").slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(base[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  const withD1 = base + String(d1);
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(withD1[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return withD1 + String(d2);
}

function generatePlate(index) {
  // Formato Mercosul: AAA0A00 — usa prefixo TST + variação
  const letters = "ABCDEFGHJKLMNPRSTUVWXYZ";
  const i = index % (letters.length * letters.length);
  const a = letters[Math.floor(i / letters.length)];
  const b = letters[i % letters.length];
  const n1 = index % 10;
  const mid = letters[(index * 3) % letters.length];
  const n2 = String((index * 7) % 100).padStart(2, "0");
  return normalizePlate(`TST${n1}${mid}${n2}`.replace("TST", `T${a}${b}`));
}

function phoneFor(index) {
  const ddd = ["11", "21", "31", "41", "51", "61", "71", "81", "85", "27"][index % 10];
  const num = String(900000000 + index).slice(0, 9);
  return `(${ddd}) 9${num.slice(0, 4)}-${num.slice(4)}`;
}

async function main() {
  const [companies] = await db.execute(
    "SELECT id_company FROM company WHERE status = 1 ORDER BY id_company",
  );
  if (!companies.length) {
    throw new Error("Nenhuma empresa ativa encontrada. Execute seed-test-companies.js antes.");
  }

  const [roles] = await db.execute(
    "SELECT id_collaborator_role FROM collaborator_role ORDER BY id_collaborator_role",
  );
  if (!roles.length) {
    throw new Error("Nenhuma função de colaborador cadastrada.");
  }

  let collaboratorsInserted = 0;
  let collaboratorsSkipped = 0;
  let linksInserted = 0;
  let vehiclesInserted = 0;
  let vehiclesSkipped = 0;

  console.log(
    withVehicles
      ? `Inserindo até ${COUNT} colaboradores e ${COUNT} veículos...`
      : `Inserindo até ${COUNT} colaboradores (sem veículos)...`,
  );

  for (let i = 1; i <= COUNT; i += 1) {
    const cpf = generateValidCpf(i);
    if (!isValidCpf(cpf)) {
      throw new Error(`CPF gerado inválido para seed ${i}: ${cpf}`);
    }

    const first = FIRST_NAMES[(i - 1) % FIRST_NAMES.length];
    const last = LAST_NAMES[(i - 1) % LAST_NAMES.length];
    const name = `${first} ${last} Teste ${String(i).padStart(3, "0")}`;
    const roleId = roles[(i - 1) % roles.length].id_collaborator_role;
    const companyId = companies[(i - 1) % companies.length].id_company;
    const rg = `MG${String(1000000 + i)}`;
    const phone = phoneFor(i);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.execute(
        `INSERT INTO collaborator (
           id_collaborator_document_type, id_collaborator_role,
           document, name, rg, phone, status
         ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [DOC_TYPE_CPF, roleId, cpf, name, rg, phone],
      );

      const collaboratorId = result.insertId;
      await conn.execute(
        `INSERT IGNORE INTO company_collaborator (id_company, id_collaborator)
         VALUES (?, ?)`,
        [companyId, collaboratorId],
      );

      await conn.commit();
      collaboratorsInserted += 1;
      linksInserted += 1;
    } catch (err) {
      await conn.rollback();
      if (err.code === "ER_DUP_ENTRY") {
        collaboratorsSkipped += 1;
      } else {
        throw err;
      }
    } finally {
      conn.release();
    }
  }

  if (withVehicles) {
    for (let i = 1; i <= COUNT; i += 1) {
      const plate = generatePlate(i);
      if (!isValidPlate(plate)) {
        throw new Error(`Placa gerada inválida para seed ${i}: ${plate}`);
      }

      const brandInfo = BRANDS[(i - 1) % BRANDS.length];
      const model = brandInfo.models[(i - 1) % brandInfo.models.length];
      const color = COLORS[(i - 1) % COLORS.length];
      const type = TYPES[(i - 1) % TYPES.length];
      const description = `Veículo de teste ${String(i).padStart(3, "0")}`;
      const companyId = companies[(i - 1) % companies.length].id_company;

      try {
        await db.execute(
          `INSERT INTO vehicle (
             id_company, plate, brand, model, color, type, description, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [companyId, plate, brandInfo.brand, model, color, type, description],
        );
        vehiclesInserted += 1;
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
          vehiclesSkipped += 1;
        } else {
          throw err;
        }
      }
    }
  }

  const [[{ colCount }]] = await db.execute("SELECT COUNT(*) AS colCount FROM collaborator");
  const [[{ linkCount }]] = await db.execute(
    "SELECT COUNT(*) AS linkCount FROM company_collaborator",
  );
  const [[{ vehCount }]] = await db.execute("SELECT COUNT(*) AS vehCount FROM vehicle");

  console.log(
    JSON.stringify(
      {
        withVehicles,
        companiesUsed: companies.length,
        collaboratorsInserted,
        collaboratorsSkipped,
        linksInserted,
        vehiclesInserted,
        vehiclesSkipped,
        totals: {
          collaborators: colCount,
          company_collaborator: linkCount,
          vehicles: vehCount,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
