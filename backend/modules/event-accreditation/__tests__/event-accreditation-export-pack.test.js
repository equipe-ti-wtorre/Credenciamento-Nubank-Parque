const assert = require("assert");
const {
  sanitizePersonFileName,
  uniquePhotoName,
  collectExportPeople,
} = require("../event-accreditation.service");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

console.log("event-accreditation-export-pack unit tests");

test("sanitizePersonFileName remove acentos e caracteres inválidos", () => {
  assert.strictEqual(sanitizePersonFileName("João da Silva"), "Joao-da-Silva");
  assert.strictEqual(sanitizePersonFileName("Ana / Costa?"), "Ana-Costa");
  assert.strictEqual(sanitizePersonFileName("   "), "colaborador");
});

test("uniquePhotoName incrementa colisão", () => {
  const used = new Set();
  assert.strictEqual(uniquePhotoName("Ana Silva", ".jpg", used), "Ana-Silva.jpg");
  assert.strictEqual(uniquePhotoName("Ana Silva", ".jpg", used), "Ana-Silva-2.jpg");
  assert.strictEqual(uniquePhotoName("Ana Silva", ".jpg", used), "Ana-Silva-3.jpg");
});

test("collectExportPeople lista internos sem arquivo de foto", () => {
  const { people, sheetGroups } = collectExportPeople(
    {
      internals: [
        {
          nome_completo: "Maria Interna",
          email: "maria@empresa.com",
          departamento: "TI",
          bracelet_name: "Staff",
          access_status_description: "Aprovado",
        },
      ],
      companies: [],
    },
    new Set(),
  );
  assert.strictEqual(people.length, 1);
  assert.strictEqual(people[0].arquivo_foto, "Sem foto");
  assert.strictEqual(people[0].photoFile, null);
  assert.strictEqual(sheetGroups[0].name, "Colaboradores internos");
});

test("collectExportPeople colaborador sem picture fica Sem foto", () => {
  const { people } = collectExportPeople(
    {
      internals: [],
      companies: [
        {
          fancy_name: "Produtora",
          company_name: "Produtora LTDA",
          collaborators: [
            {
              collaborator_name: "Pedro Alves",
              collaborator_document: "123",
              collaborator_picture: null,
              role_description: "Técnico",
              bracelet_name: "Crew",
              access_status_description: "Aprovado",
            },
          ],
        },
      ],
    },
    new Set(),
  );
  assert.strictEqual(people.length, 1);
  assert.strictEqual(people[0].foto, "Sem foto");
  assert.strictEqual(people[0].arquivo_foto, "Sem foto");
  assert.strictEqual(people[0].photoFile, null);
});

console.log("event-accreditation-export-pack unit tests: ok");
