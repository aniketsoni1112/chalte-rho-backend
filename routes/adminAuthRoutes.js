const router = require("express").Router();
const { adminLogin, seedAdmin } = require("../controllers/adminAuthController");

// Private admin login — not listed in public API docs
router.post("/login", adminLogin);

// One-time seed route to create first admin
router.post("/seed", seedAdmin);

module.exports = router;
