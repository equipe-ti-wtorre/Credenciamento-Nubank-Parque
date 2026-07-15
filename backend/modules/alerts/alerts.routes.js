const express = require("express");
const alertsController = require("./alerts.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");

const router = express.Router();
const auth = authMiddleware;

router.get("/", auth, alertsController.list);
router.get("/unread-count", auth, alertsController.unreadCount);
router.post("/read-all", auth, alertsController.markAllRead);
router.post("/:id/read", auth, alertsController.markRead);

module.exports = router;