const express = require("express");
const credentialsController = require("./credentials.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");

const router = express.Router();
const authenticated = [authMiddleware];

router.get("/", ...authenticated, credentialsController.list);
router.get("/:id", ...authenticated, credentialsController.getById);
router.post("/", ...authenticated, credentialsController.create);
router.patch("/:id/status", ...authenticated, credentialsController.patchStatus);

module.exports = router;
