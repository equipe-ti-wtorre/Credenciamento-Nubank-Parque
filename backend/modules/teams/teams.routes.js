const express = require("express");
const teamsController = require("./teams.controller");
const { authMiddleware, authorizeRoles } = require("../../middleware/authMiddleware");

const router = express.Router();

router.get("/", authMiddleware, authorizeRoles("ADMIN"), teamsController.list);
router.get("/config", authMiddleware, authorizeRoles("ADMIN"), teamsController.config);
router.get("/:id", authMiddleware, authorizeRoles("ADMIN"), teamsController.getById);
router.post("/", authMiddleware, authorizeRoles("ADMIN"), teamsController.create);
router.put("/:id", authMiddleware, authorizeRoles("ADMIN"), teamsController.update);
router.delete("/:id", authMiddleware, authorizeRoles("ADMIN"), teamsController.remove);
router.post("/:id/test", authMiddleware, authorizeRoles("ADMIN"), teamsController.test);
router.post("/:id/send", authMiddleware, authorizeRoles("ADMIN"), teamsController.send);

module.exports = router;
