const express = require("express");
const eventController = require("./event.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");

const router = express.Router();

router.get("/types", authMiddleware, eventController.listTypes);

module.exports = router;
