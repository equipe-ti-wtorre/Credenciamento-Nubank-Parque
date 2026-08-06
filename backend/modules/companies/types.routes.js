const express = require("express");
const companyController = require("./company.controller");
const { authMiddleware } = require("../../middleware/authMiddleware");

const router = express.Router();

router.get("/types", authMiddleware, companyController.listTypes);

module.exports = router;
