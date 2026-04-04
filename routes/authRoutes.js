const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  register, login,
  sendOtpHandler, verifyOtpHandler,
  savePushSubscription, getVapidKey,
} = require("../controllers/authController");

router.post("/register", register);
router.post("/login", login);
router.post("/send-otp", sendOtpHandler);
router.post("/verify-otp", verifyOtpHandler);
router.post("/push-subscription", auth, savePushSubscription);
router.get("/vapid-key", getVapidKey);

module.exports = router;
