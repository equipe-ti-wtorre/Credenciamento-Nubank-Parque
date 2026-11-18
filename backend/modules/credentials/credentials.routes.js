const express = require("express");
const credentialsController = require("./credentials.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoCredencial } = require("../../middleware/vinculos");

const router = express.Router();
const authenticated = [authMiddleware];
const credentialId = resolverPublicId({
  param: "id",
  table: "event_day_company_collaborator",
  pk: "id_event_day_company_collaborator",
});
const readCredential = autorizar({ modulo: "events", acao: "view", vinculo: vinculoCredencial });
const editCredential = autorizar({ modulo: "events", acao: "edit", vinculo: vinculoCredencial });

router.get("/", ...authenticated, readCredential, credentialsController.list);
router.get("/:id", authMiddleware, credentialId, readCredential, credentialsController.getById);
router.post("/", authMiddleware, editCredential, credentialsController.create);
router.delete("/:id", authMiddleware, credentialId, editCredential, credentialsController.remove);
router.patch("/:id/status", authMiddleware, credentialId, editCredential, credentialsController.patchStatus);

module.exports = router;
