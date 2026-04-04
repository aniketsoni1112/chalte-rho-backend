const router = require("express").Router();
const adminAuth = require("../middleware/adminAuth");
const {
  getStats, getAllUsers, blockUser, verifyDriver,
  getAllRides, getSurge, setSurge, removeSurge,
  getCoupons, createCoupon, toggleCoupon,
  broadcast, getTickets, resolveTicket, getPayouts,
} = require("../controllers/adminController");

router.get("/stats", adminAuth, getStats);
router.get("/users", adminAuth, getAllUsers);
router.patch("/block/:id", adminAuth, blockUser);
router.patch("/verify/:id", adminAuth, verifyDriver);
router.get("/rides", adminAuth, getAllRides);
router.get("/surge", adminAuth, getSurge);
router.post("/surge", adminAuth, setSurge);
router.delete("/surge/:area", adminAuth, removeSurge);
router.get("/coupons", adminAuth, getCoupons);
router.post("/coupons", adminAuth, createCoupon);
router.patch("/coupons/:code", adminAuth, toggleCoupon);
router.post("/broadcast", adminAuth, broadcast);
router.get("/tickets", adminAuth, getTickets);
router.patch("/tickets/:id", adminAuth, resolveTicket);
router.get("/payouts", adminAuth, getPayouts);

module.exports = router;
