const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendOtp, verifyOtp } = require("../utils/otp");
const { sendEmailOtp, verifyEmailOtp, markEmailVerified, isEmailVerified, clearEmailVerified } = require("../utils/emailOtp");

const genToken = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "7d" });

const safeUser = (user) => ({
  _id:           String(user._id),
  name:          user.name,
  email:         user.email,
  phone:         user.phone,
  role:          user.role,
  wallet:        user.wallet,
  vehicle:       user.vehicle,
  vehicleNo:     user.vehicleNo,
  vehicleNumber: user.vehicleNumber,
  captainStatus: user.captainStatus,
  profileImage:  user.profileImage,
});

// Email/Password Register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, vehicleNumber, rcCardNumber, licenseNumber, vehicle, phone } = req.body;
    const safeRole = role === "driver" ? "driver" : "user";
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ msg: "Email already registered" });
    const hash = await bcrypt.hash(password, 10);
    const userData = { name, email, password: hash, role: safeRole };
    if (phone) userData.phone = phone;
    // Captain-specific fields
    if (safeRole === "driver") {
      if (vehicleNumber) userData.vehicleNumber = vehicleNumber;
      if (rcCardNumber)  userData.rcCardNumber  = rcCardNumber;
      if (licenseNumber) userData.licenseNumber = licenseNumber;
      if (vehicle)       userData.vehicle       = vehicle;
      userData.captainStatus = "pending"; // always starts pending
    }
    const user = await User.create(userData);
    res.json({ token: genToken(user._id, user.role), user });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Email/Password Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "User not found" });
    if (!user.password) return res.status(400).json({ msg: "This account uses OTP login. Use \"Get OTP\" to sign in." });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ msg: "Wrong password" });
    res.json({ token: genToken(user._id, user.role), user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ── SEND EMAIL OTP (login or reset) ──
exports.sendEmailOtpHandler = async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!email) return res.status(400).json({ msg: "Email required" });

    // Step 1: Check DB — only registered emails receive OTP
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`❌ OTP denied — email not in DB: ${email}`);
      return res.status(404).json({ msg: "No account found with this email" });
    }

    // Step 2: Send OTP to user's email (EMAIL_USER from .env is the sender)
    await sendEmailOtp(email, purpose || "login");
    console.log(`✅ OTP sent | from: ${process.env.EMAIL_USER} | to: ${email} | purpose: ${purpose || "login"}`);
    res.json({ msg: "OTP sent to your email" });
  } catch (err) {
    console.error("sendEmailOtp error:", err.message);
    res.status(500).json({ msg: err.message || "Failed to send OTP" });
  }
};

// ── VERIFY EMAIL OTP → issue JWT ──
exports.verifyEmailOtpHandler = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ msg: "Email and OTP required" });

    // Step 1: Integrity + Expiry check
    const result = verifyEmailOtp(email, otp);
    if (!result.valid) {
      console.log(`❌ OTP invalid for ${email}: ${result.msg}`);
      return res.status(400).json({ msg: result.msg });
    }

    // Step 2: Confirm user still exists in DB
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "No account found with this email" });

    // Step 3: Issue JWT
    const token = genToken(user._id, user.role);
    console.log(`✅ OTP verified | email: ${email} | role: ${user.role} | JWT issued`);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ── FORGOT PASSWORD: verify email via OTP ──
exports.forgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = verifyEmailOtp(email, otp);
    if (!result.valid) return res.status(400).json({ msg: result.msg });
    markEmailVerified(email);
    res.json({ msg: "Email verified. You may now reset your password.", verified: true });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ── RESET PASSWORD ──
exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!isEmailVerified(email))
      return res.status(403).json({ msg: "Email not verified. Please verify OTP first." });
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ msg: "Password must be at least 6 characters" });
    const hash = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate({ email }, { password: hash });
    clearEmailVerified(email);
    res.json({ msg: "Password reset successfully. You can now log in." });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Send OTP
exports.sendOtpHandler = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ msg: "Phone required" });
    await sendOtp(phone);
    res.json({ msg: "OTP sent" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Verify OTP + Login/Register
exports.verifyOtpHandler = async (req, res) => {
  try {
    const { phone, otp, name, role } = req.body;
    const valid = verifyOtp(phone, otp);
    if (!valid) return res.status(400).json({ msg: "Invalid or expired OTP" });

    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({ phone, name: name || "User", role: role || "user" });
    }
    res.json({ token: genToken(user._id, user.role), user });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Save push subscription
exports.savePushSubscription = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { pushSubscription: req.body.subscription });
    res.json({ msg: "Subscription saved" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Get VAPID public key
exports.getVapidKey = (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC });
};
