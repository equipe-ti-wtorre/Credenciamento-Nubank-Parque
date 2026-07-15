const express = require("express");
const approvalsController = require("./approvals.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");

const router = express.Router();

router.get("/pending", authMiddleware, approvalsController.listPending);
router.get("/pending/count", authMiddleware, approvalsController.countPending);
router.get("/mine", authMiddleware, approvalsController.listMine);
router.get("/sectors/:tipoEntidade", authMiddleware, approvalsController.listEligibleSectors);
router.get("/:id", authMiddleware, approvalsController.getById);
router.post("/:id/approve", authMiddleware, approvalsController.approve);
router.post("/:id/reject", authMiddleware, approvalsController.reject);
router.post("/:id/cancel", authMiddleware, approvalsController.cancel);

module.exports = router;
