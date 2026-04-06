const User = require("../models/User");

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, email, phone, profileImage } = req.body;
    const update = { name, email, phone };
    if (profileImage) update.profileImage = profileImage;
    const user = await User.findByIdAndUpdate(
      req.user.id, update, { new: true }
    ).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.addWallet = async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, { $inc: { wallet: amount } }, { returnDocument: 'after' }).select("-password");
    res.json({ wallet: user.wallet });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.saveUpi = async (req, res) => {
  try {
    const { upi } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, { $addToSet: { upiIds: upi } }, { returnDocument: 'after' }).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.addAddress = async (req, res) => {
  try {
    const { type, address } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, { $push: { savedAddresses: { type, address } } }, { returnDocument: 'after' }).select("-password");
    res.json(user.savedAddresses);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("savedAddresses");
    res.json(user.savedAddresses || []);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.addEmergencyContact = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, { $push: { emergencyContacts: { name, phone } } }, { returnDocument: 'after' }).select("-password");
    res.json(user.emergencyContacts);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.submitSupport = async (req, res) => {
  try {
    const { issue, description } = req.body;
    // In production, save to DB or send email
    console.log(`Support ticket from ${req.user.id}: [${issue}] ${description}`);
    res.json({ msg: "Support ticket submitted", ticketId: "TKT" + Date.now() });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.buyPass = async (req, res) => {
  try {
    const { plan } = req.body;
    const days = { daily: 1, weekly: 7, monthly: 30 };
    const expiry = new Date(Date.now() + (days[plan] || 7) * 24 * 60 * 60 * 1000);
    const user = await User.findByIdAndUpdate(req.user.id, { activePass: { plan, expiry } }, { returnDocument: 'after' }).select("-password");
    res.json({ plan, expiry });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};
