const express = require("express");
const alertsController = require("./alerts.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");
const { resolverPublicId } = require("../../middleware/resolverPublicId");
const { autorizar } = require("../../middleware/autorizar");
const { vinculoAlerta } = require("../../middleware/vinculos");

const router = express.Router();
const auth = authMiddleware;

const alertId = resolverPublicId({ param: "id", table: "alertas", pk: "id" });
const ownAlert = autorizar({ vinculo: vinculoAlerta });

router.get("/", auth, alertsController.list);
router.get("/unread-count", auth, alertsController.unreadCount);
router.post("/read-all", auth, alertsController.markAllRead);
router.delete("/clear-all", auth, alertsController.removeAll);
router.post("/:id/read", auth, alertId, ownAlert, alertsController.markRead);
router.delete("/:id", auth, alertId, ownAlert, alertsController.remove);

module.exports = router;