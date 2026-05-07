const router = require("express").Router();
const managerAuth = require("../middleware/managerAuth");
const {
  registerManager, loginManager,
  getCaptains, approveCaptain,
  getApprovalHistory, getManagerStats,
} = require("../controllers/managerController");

// Public
router.post("/register", registerManager); // requires MANAGER_SECRET_KEY in body
router.post("/login", loginManager);

// Protected (manager + admin)
router.get("/stats", managerAuth, getManagerStats);
router.get("/captains", managerAuth, getCaptains);
router.patch("/captains/:id/approve", managerAuth, approveCaptain);
router.get("/captains/history", managerAuth, getApprovalHistory);

module.exports = router;
