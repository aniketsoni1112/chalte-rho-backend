const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  requestRide, estimateFare,
  acceptRide, captainArrived,
  verifyOTP, completeRide,
  cancelRide, rateRide,
  getRideHistory, getAllRides,
} = require("../controllers/rideController");

router.post("/request", auth, requestRide);
router.post("/estimate", auth, estimateFare);
router.post("/accept/:id", auth, acceptRide);
router.post("/arrived/:id", auth, captainArrived);
router.post("/verify-otp/:id", auth, verifyOTP);
router.post("/complete/:id", auth, completeRide);
router.post("/cancel/:id", auth, cancelRide);
router.post("/rate/:id", auth, rateRide);
router.post("/:id/rate", auth, rateRide);
router.get("/history", auth, getRideHistory);
router.get("/all", auth, getAllRides);
router.get("/", auth, getAllRides);

module.exports = router;
