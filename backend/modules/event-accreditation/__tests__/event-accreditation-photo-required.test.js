const assert = require("assert");
const {
  hasCollaboratorPicture,
  countsTowardPhotoGate,
  countMissingPhotosFromList,
  missingPhotoNotifyMessage,
  missingPhotoSectorMessage,
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

console.log("event-accreditation-photo-required unit tests");

test("hasCollaboratorPicture ignora nulo e vazio", () => {
  assert.strictEqual(hasCollaboratorPicture(null), false);
  assert.strictEqual(hasCollaboratorPicture(""), false);
  assert.strictEqual(hasCollaboratorPicture("   "), false);
  assert.strictEqual(hasCollaboratorPicture("abc.jpg"), true);
});

test("countsTowardPhotoGate só pendentes e aprovados", () => {
  assert.strictEqual(countsTowardPhotoGate(1), true);
  assert.strictEqual(countsTowardPhotoGate(2), true);
  assert.strictEqual(countsTowardPhotoGate(3), true);
  assert.strictEqual(countsTowardPhotoGate(4), false);
  assert.strictEqual(countsTowardPhotoGate(5), false);
});

test("countMissingPhotosFromList ignora bloqueados", () => {
  const missing = countMissingPhotosFromList([
    { id_access_status: 2, collaborator_picture: null },
    { id_access_status: 3, collaborator_picture: "ok.jpg" },
    { id_access_status: 4, collaborator_picture: null },
  ]);
  assert.strictEqual(missing, 1);
});

test("missingPhotoNotifyMessage pluraliza", () => {
  assert.match(missingPhotoNotifyMessage(1), /1 colaborador sem foto/);
  assert.match(missingPhotoNotifyMessage(3), /3 colaboradores sem foto/);
});

test("missingPhotoSectorMessage avisa o setor", () => {
  assert.match(missingPhotoSectorMessage(1), /1 colaborador sem foto/);
  assert.match(missingPhotoSectorMessage(1), /setor só pode ser avisado/);
  assert.match(missingPhotoSectorMessage(3), /3 colaboradores sem foto/);
  assert.match(missingPhotoSectorMessage(3), /setor só pode ser avisado/);
});

console.log("event-accreditation-photo-required unit tests: ok");
