const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendOtp, verifyOtp } = require("../utils/otp");

const genToken = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Email/Password Register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    // Only allow valid roles — prevent "rider" or other invalid values
    const safeRole = role === "driver" ? "driver" : "user";
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ msg: "Email already registered" });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hash, role: safeRole });
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
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ msg: "Wrong password" });
    res.json({ token: genToken(user._id, user.role), user });
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
