const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { chat, getHistory } = require("../controllers/chatController");

router.post("/", auth, chat);
router.get("/history", auth, getHistory);

module.exports = router;
