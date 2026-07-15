"use strict";

const express = require("express");
const botController = require("./bot.controller");
const { authMiddleware } = require("../../../middleware/authMiddleware");
const { authorizePermission } = require("../../../middleware/permissionMiddleware");

const router = express.Router();

/** Messaging endpoint do Azure Bot — sem auth de API (valida JWT do Bot Framework). */
router.post("/messages", botController.messages);

router.get(
  "/status",
  authMiddleware,
  authorizePermission("settings_teams", "view"),
  botController.status,
);

module.exports = router;
