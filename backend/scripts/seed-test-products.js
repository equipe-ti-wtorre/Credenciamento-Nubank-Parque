/**
 * Gera 100 produtos de teste (mercadorias).
 * Uso: node scripts/seed-test-products.js
 */
require("dotenv").config();
const db = require("../config/db");

const COUNT = 100;

const UNITS = ["UN", "CX", "PCT", "KG", "L", "M", "PAR", "RL", "FD", "SC"];

const MANUFACTURERS = [
  "Coca-Cola", "Ambev", "Nestlé", "Unilever", "Pepsico", "Bauducco",
  "Tramontina", "3M", "Kimberly-Clark", "SC Johnson", "Ypê", "Bombril",
  "Samsung", "Dell", "HP", "Epson", "Logitech", "JBL", "Sony", "Philips",
  "Genérico", "Arena Supply", "EventPro", "Catering Brasil", "SoundTech",
];

const PRODUCT_BASES = [
  ["Água Mineral 500ml", "UN"],
  ["Água Mineral 1,5L", "UN"],
  ["Refrigerante Cola 350ml", "UN"],
  ["Refrigerante Cola 2L", "UN"],
  ["Suco de Laranja 1L", "UN"],
  ["Cerveja Lata 350ml", "UN"],
  ["Energético 250ml", "UN"],
  ["Café Torrado e Moído 500g", "PCT"],
  ["Chá Mate 1L", "UN"],
  ["Isotônico 500ml", "UN"],
  ["Biscoito Recheado", "PCT"],
  ["Salgadinho 100g", "PCT"],
  ["Barra de Cereal", "UN"],
  ["Chocolate ao Leite", "UN"],
  ["Amendoim Japonês", "PCT"],
  ["Pipoca Doce", "PCT"],
  ["Guardanapo de Papel", "PCT"],
  ["Copo Descartável 200ml", "PCT"],
  ["Copo Descartável 300ml", "PCT"],
  ["Prato Descartável", "PCT"],
  ["Talher Descartável", "PCT"],
  ["Sacola Plástica", "PCT"],
  ["Papel Toalha", "RL"],
  ["Papel Higiênico", "PCT"],
  ["Sabonete Líquido", "L"],
  ["Álcool Gel 500ml", "UN"],
  ["Detergente Neutro", "L"],
  ["Desinfetante", "L"],
  ["Saco de Lixo 100L", "PCT"],
  ["Luva de Procedimento", "CX"],
  ["Máscara Descartável", "CX"],
  ["Fita Crepe 48mm", "UN"],
  ["Fita Isolante", "UN"],
  ["Cabo HDMI 5m", "UN"],
  ["Extensão Elétrica 10m", "UN"],
  ["Tomada Múltipla", "UN"],
  ["Lâmpada LED 9W", "UN"],
  ["Pilhas AA", "PCT"],
  ["Pilhas AAA", "PCT"],
  ["Lanterna LED", "UN"],
  ["Abraçadeira Nylon", "PCT"],
  ["Fita Dupla Face", "UN"],
  ["Cordão de Credenciamento", "UN"],
  ["Crachá PVC", "UN"],
  ["Pulseira de Identificação", "PCT"],
  ["Caneta Esferográfica", "CX"],
  ["Bloco de Anotações", "UN"],
  ["Clipes para Papel", "CX"],
  ["Envelope A4", "PCT"],
  ["Caixa de Papelão Média", "UN"],
  ["Palete de Madeira", "UN"],
  ["Filme Stretch", "RL"],
  ["Lona Plástica 4x4m", "UN"],
  ["Tapete Antiderrapante", "M"],
  ["Cone de Sinalização", "UN"],
  ["Fita Zebrada", "RL"],
  ["Cadeado Médio", "UN"],
  ["Corrente Galvanizada", "M"],
  ["Kit Primeiros Socorros", "UN"],
  ["Extintor PQS 4kg", "UN"],
  ["Cadeira Plástica", "UN"],
  ["Mesa Dobrável", "UN"],
  ["Tenda 3x3m", "UN"],
  ["Cooler Térmico 45L", "UN"],
  ["Gelo em Cubos", "KG"],
  ["Sal Grosso", "KG"],
  ["Açúcar Cristal", "KG"],
  ["Copos de Chopp", "CX"],
  ["Bandeja de Serviço", "UN"],
  ["Garrafa Térmica 1L", "UN"],
  ["Toalha de Mesa", "UN"],
  ["Avental de Cozinha", "UN"],
  ["Touca Descartável", "CX"],
  ["Óleo de Cozinha", "L"],
  ["Farinha de Trigo", "KG"],
  ["Molho de Tomate", "UN"],
  ["Catchup", "UN"],
  ["Mostarda", "UN"],
  ["Maionese", "UN"],
  ["Queijo Fatiado", "KG"],
  ["Presunto Fatiado", "KG"],
  ["Pão Francês", "KG"],
  ["Pão de Forma", "UN"],
  ["Hambúrguer Congelado", "CX"],
  ["Batata Congelada", "KG"],
  ["Sorvete Pote 2L", "UN"],
  ["Copo Térmico", "UN"],
  ["Canudo Papel", "PCT"],
  ["Mexedor de Café", "PCT"],
  ["Açúcar Sachê", "CX"],
  ["Adoçante Sachê", "CX"],
  ["Leite UHT 1L", "UN"],
  ["Creme de Leite", "UN"],
  ["Manteiga 200g", "UN"],
  ["Ovos Cartela 30un", "CX"],
  ["Bacon Fatiado", "KG"],
  ["Frango Congelado", "KG"],
  ["Carne Moída", "KG"],
  ["Arroz Tipo 1", "KG"],
  ["Feijão Carioca", "KG"],
  ["Macarrão Espaguete", "PCT"],
  ["Azeite Extra Virgem", "UN"],
];

async function main() {
  let inserted = 0;
  let skipped = 0;

  console.log(`Inserindo até ${COUNT} produtos...`);

  for (let i = 1; i <= COUNT; i += 1) {
    const base = PRODUCT_BASES[(i - 1) % PRODUCT_BASES.length];
    const description = `${base[0]} Teste ${String(i).padStart(3, "0")}`;
    const unit = base[1] || UNITS[(i - 1) % UNITS.length];
    const manufacturer = MANUFACTURERS[(i - 1) % MANUFACTURERS.length];

    try {
      await db.execute(
        `INSERT INTO product (description, unit_measure, manufacturer, status)
         VALUES (?, ?, ?, 1)`,
        [description, unit, manufacturer],
      );
      inserted += 1;
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        skipped += 1;
      } else {
        throw err;
      }
    }
  }

  const [[{ total }]] = await db.execute("SELECT COUNT(*) AS total FROM product");
  const [sample] = await db.execute(
    `SELECT id_product, description, unit_measure, manufacturer
     FROM product WHERE description LIKE '%Teste%'
     ORDER BY id_product ASC LIMIT 5`,
  );
  const [last] = await db.execute(
    `SELECT id_product, description, unit_measure, manufacturer
     FROM product WHERE description LIKE '%Teste%'
     ORDER BY id_product DESC LIMIT 3`,
  );

  console.log(JSON.stringify({ inserted, skipped, total, sample, last }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
