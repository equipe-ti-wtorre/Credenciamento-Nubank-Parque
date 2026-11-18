const express = require("express");
const approvalsController = require("./approvals.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoAprovacao } = require("../../middleware/vinculos");

const router = express.Router();

const approvalId = resolverPublicId({ param: "id", table: "aprovacoes", pk: "id" });
const readApproval = autorizar({ modulo: "approvals", acao: "view", vinculo: vinculoAprovacao });
// Decidir (aprovar/reprovar/cancelar) usa "view": perfis de aprovador só têm essa ação.
// Quem pode decidir de fato é o papel no time + fluxo, checado no service.
const decideApproval = readApproval;
// Listagens: mesma permissão do menu e da rota /aprovacoes; o service ainda filtra por escopo.
const listApprovals = autorizar({ modulo: "approvals", acao: "view" });

router.get("/pending", authMiddleware, listApprovals, approvalsController.listPending);
router.get("/pending/count", authMiddleware, listApprovals, approvalsController.countPending);
router.get("/mine", authMiddleware, listApprovals, approvalsController.listMine);
router.get("/team", authMiddleware, listApprovals, approvalsController.listTeam);
router.get("/sectors/:tipoEntidade", authMiddleware, approvalsController.listEligibleSectors);
router.get("/:id", authMiddleware, approvalId, readApproval, approvalsController.getById);
router.post("/:id/approve", authMiddleware, approvalId, decideApproval, approvalsController.approve);
router.post("/:id/reject", authMiddleware, approvalId, decideApproval, approvalsController.reject);
router.post("/:id/cancel", authMiddleware, approvalId, decideApproval, approvalsController.cancel);

module.exports = router;
