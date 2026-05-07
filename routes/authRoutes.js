const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  register, login,
  sendOtpHandler, verifyOtpHandler,
  sendEmailOtpHandler, verifyEmailOtpHandler,
  forgotPasswordOtp, resetPassword,
  savePushSubscription, getVapidKey,
} = require("../controllers/authController");

router.post("/register",           register);
router.post("/login",              login);

// Phone OTP (existing)
router.post("/send-otp",           sendOtpHandler);
router.post("/verify-otp",         verifyOtpHandler);

// Email OTP login
router.post("/send-email-otp",     sendEmailOtpHandler);
router.post("/verify-email-otp",   verifyEmailOtpHandler);

// Forgot / Reset password
router.post("/forgot-password",    sendEmailOtpHandler);   // step 1: send OTP (purpose=reset)
router.post("/forgot-verify-otp",  forgotPasswordOtp);     // step 2: verify OTP
router.post("/reset-password",     resetPassword);         // step 3: set new password

router.post("/push-subscription",  auth, savePushSubscription);
router.get("/vapid-key",           getVapidKey);

module.exports = router;
