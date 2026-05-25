const express = require("express");
const collaboratorController = require("./collaborator.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");

const router = express.Router();

router.get("/types", authMiddleware, collaboratorController.listTypes);
router.get("/roles", authMiddleware, collaboratorController.listRoles);

module.exports = router;
