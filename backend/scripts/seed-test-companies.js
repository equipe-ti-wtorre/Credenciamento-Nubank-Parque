/**
 * Gera 5 empresas de teste.
 * Uso: node scripts/seed-test-companies.js
 */
require("dotenv").config();
const db = require("../config/db");
const { isValidCnpj } = require("../utils/cnpj");

function generateValidCnpj(seed) {
  // Base determinística (12 dígitos) a partir do seed
  const base = String(900000000000 + seed).padStart(12, "0").slice(0, 12);
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(base[i]) * weights1[i];
  let rem = sum % 11;
  const d1 = rem < 2 ? 0 : 11 - rem;

  const withD1 = base + String(d1);
  sum = 0;
  for (let i = 0; i < 13; i += 1) sum += Number(withD1[i]) * weights2[i];
  rem = sum % 11;
  const d2 = rem < 2 ? 0 : 11 - rem;

  return withD1 + String(d2);
}

const COMPANIES = [
  {
    seed: 1,
    id_company_type: 1,
    company_name: "EVENTOS ALPHA SERVICOS LTDA",
    fancy_name: "Alpha Eventos",
    contacts: [
      {
        name: "Carlos Mendes",
        department: "Operações",
        phone: "(11) 98888-0001",
        email: "carlos@alphaeventos.teste",
      },
    ],
  },
  {
    seed: 2,
    id_company_type: 2,
    company_name: "PRODUTORA BETA SHOWS S.A.",
    fancy_name: "Beta Shows",
    contacts: [
      {
        name: "Fernanda Lima",
        department: "Produção",
        phone: "(21) 97777-0002",
        email: "fernanda@betashows.teste",
      },
    ],
  },
  {
    seed: 3,
    id_company_type: 1,
    company_name: "GAMMA SEGURANCA E LOGISTICA LTDA",
    fancy_name: "Gamma Segurança",
    contacts: [
      {
        name: "Roberto Souza",
        department: "Segurança",
        phone: "(31) 96666-0003",
        email: "roberto@gammaseg.teste",
      },
    ],
  },
  {
    seed: 4,
    id_company_type: 2,
    company_name: "DELTA PRODUCOES ARTISTICAS LTDA",
    fancy_name: "Delta Produções",
    contacts: [
      {
        name: "Juliana Costa",
        department: "Artístico",
        phone: "(41) 95555-0004",
        email: "juliana@deltaproducoes.teste",
      },
    ],
  },
  {
    seed: 5,
    id_company_type: 1,
    company_name: "OMEGA CATERING E SERVICOS LTDA",
    fancy_name: "Omega Catering",
    contacts: [
      {
        name: "Marcos Oliveira",
        department: "Comercial",
        phone: "(51) 94444-0005",
        email: "marcos@omegacatering.teste",
      },
    ],
  },
];

async function main() {
  const [types] = await db.execute("SELECT id_company_type FROM company_type");
  if (types.length === 0) {
    throw new Error("Nenhum tipo de empresa cadastrado.");
  }

  let inserted = 0;
  let skipped = 0;
  const created = [];

  for (const company of COMPANIES) {
    const cnpj = generateValidCnpj(company.seed);
    if (!isValidCnpj(cnpj)) {
      throw new Error(`CNPJ gerado inválido para seed ${company.seed}: ${cnpj}`);
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.execute(
        `INSERT INTO company (id_company_type, cnpj, company_name, fancy_name, status)
         VALUES (?, ?, ?, ?, 1)`,
        [company.id_company_type, cnpj, company.company_name, company.fancy_name],
      );

      const companyId = result.insertId;
      for (const contact of company.contacts) {
        await conn.execute(
          `INSERT INTO company_contact (id_company, name, department, phone, email)
           VALUES (?, ?, ?, ?, ?)`,
          [
            companyId,
            contact.name,
            contact.department || null,
            contact.phone || null,
            contact.email || null,
          ],
        );
      }

      await conn.commit();
      inserted += 1;
      created.push({
        id_company: companyId,
        fancy_name: company.fancy_name,
        cnpj,
        id_company_type: company.id_company_type,
      });
    } catch (err) {
      await conn.rollback();
      if (err.code === "ER_DUP_ENTRY") {
        skipped += 1;
      } else {
        throw err;
      }
    } finally {
      conn.release();
    }
  }

  const [[{ total }]] = await db.execute("SELECT COUNT(*) AS total FROM company");
  console.log(JSON.stringify({ inserted, skipped, total, created }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
