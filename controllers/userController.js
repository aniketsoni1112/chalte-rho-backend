const User = require("../models/User");

// GET profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json(user);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

// UPDATE profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, profileImage } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { ...(name && { name }), ...(phone && { phone }), ...(profileImage && { profileImage }) },
      { new: true, select: "-password" }
    );
    res.json(user);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

// ADD wallet balance
exports.addWallet = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ msg: "Invalid amount" });
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $inc: { wallet: amount } },
      { new: true, select: "wallet" }
    );
    res.json({ wallet: user.wallet, msg: `₹${amount} added to wallet` });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

// SAVE UPI ID
exports.saveUpi = async (req, res) => {
  try {
    const { upiId } = req.body;
    if (!upiId) return res.status(400).json({ msg: "UPI ID required" });
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { upiIds: upiId } });
    res.json({ msg: "UPI ID saved" });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

// ADD address
exports.addAddress = async (req, res) => {
  try {
    const { label, address } = req.body;
    await User.findByIdAndUpdate(req.user.id, { $push: { savedAddresses: { label, address } } });
    res.json({ msg: "Address saved" });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

// GET addresses
exports.getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("savedAddresses");
    res.json(user.savedAddresses || []);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

// ADD emergency contact
exports.addEmergencyContact = async (req, res) => {
  try {
    const { name, phone } = req.body;
    await User.findByIdAndUpdate(req.user.id, { $push: { emergencyContacts: { name, phone } } });
    res.json({ msg: "Emergency contact added" });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

// SUBMIT support ticket
exports.submitSupport = async (req, res) => {
  try {
    const { issue, description } = req.body;
    // In production: save to DB or send email
    console.log(`Support ticket from ${req.user.id}: [${issue}] ${description}`);
    res.json({ msg: "Support ticket submitted. We'll get back to you soon." });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

// BUY pass
exports.buyPass = async (req, res) => {
  try {
    const { plan } = req.body;
    const plans = { daily: 29, weekly: 149, monthly: 499 };
    const price = plans[plan];
    if (!price) return res.status(400).json({ msg: "Invalid plan" });
    const user = await User.findById(req.user.id);
    if (user.wallet < price) return res.status(400).json({ msg: "Insufficient wallet balance" });
    const expiry = new Date();
    if (plan === "daily")   expiry.setDate(expiry.getDate() + 1);
    if (plan === "weekly")  expiry.setDate(expiry.getDate() + 7);
    if (plan === "monthly") expiry.setMonth(expiry.getMonth() + 1);
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { wallet: -price },
      activePass: { plan, expiry },
    });
    res.json({ msg: `${plan} pass activated!`, expiry });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};
