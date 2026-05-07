const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const genToken = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "7d" });

// ── MANAGER REGISTRATION (requires MANAGER_SECRET_KEY) ──
exports.registerManager = async (req, res) => {
  try {
    const { name, email, password, secretKey } = req.body;
    if (secretKey !== process.env.MANAGER_SECRET_KEY)
      return res.status(403).json({ msg: "Invalid Manager Secret Key" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ msg: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);
    const manager = await User.create({ name, email, password: hash, role: "manager" });
    res.json({ token: genToken(manager._id, "manager"), user: { id: manager._id, name: manager.name, email: manager.email, role: "manager" } });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ── MANAGER LOGIN ──
exports.loginManager = async (req, res) => {
  try {
    const { email, password } = req.body;
    const manager = await User.findOne({ email, role: "manager" });
    if (!manager) return res.status(404).json({ msg: "Manager not found" });
    const valid = await bcrypt.compare(password, manager.password);
    if (!valid) return res.status(400).json({ msg: "Wrong password" });
    res.json({ token: genToken(manager._id, "manager"), user: { id: manager._id, name: manager.name, email: manager.email, role: "manager" } });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ── GET ALL CAPTAINS (pending/approved/rejected) ──
exports.getCaptains = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = { role: "driver" };
    if (status) filter.captainStatus = status;
    if (search) filter.$or = [
      { name: new RegExp(search, "i") },
      { email: new RegExp(search, "i") },
      { phone: new RegExp(search, "i") },
      { vehicleNumber: new RegExp(search, "i") },
      { licenseNumber: new RegExp(search, "i") },
    ];
    const captains = await User.find(filter)
      .select("-password")
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 });
    res.json(captains);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ── APPROVE / REJECT CAPTAIN ──
exports.approveCaptain = async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!["approved", "rejected"].includes(status))
      return res.status(400).json({ msg: "Status must be approved or rejected" });

    const captain = await User.findOneAndUpdate(
      { _id: req.params.id, role: "driver" },
      {
        captainStatus: status,
        approvedBy:   req.user.id,       // Manager ID audit
        approvedAt:   new Date(),         // Timestamp audit
        approvalNote: note || "",
        isAvailable:  status === "approved",
      },
      { new: true }
    ).select("-password").populate("approvedBy", "name email role");

    if (!captain) return res.status(404).json({ msg: "Captain not found" });

    console.log(`📋 AUDIT | Captain: ${captain.name} | Status: ${status} | Manager: ${req.user.id} | Time: ${new Date().toISOString()}`);
    res.json(captain);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ── APPROVAL HISTORY ──
exports.getApprovalHistory = async (req, res) => {
  try {
    const history = await User.find({
      role: "driver",
      captainStatus: { $in: ["approved", "rejected"] },
    })
      .select("name email phone vehicle vehicleNumber licenseNumber captainStatus approvedBy approvedAt approvalNote")
      .populate("approvedBy", "name email")
      .sort({ approvedAt: -1 })
      .limit(50);
    res.json(history);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ── MANAGER DASHBOARD STATS ──
exports.getManagerStats = async (req, res) => {
  try {
    const [total, pending, approved, rejected] = await Promise.all([
      User.countDocuments({ role: "driver" }),
      User.countDocuments({ role: "driver", captainStatus: "pending" }),
      User.countDocuments({ role: "driver", captainStatus: "approved" }),
      User.countDocuments({ role: "driver", captainStatus: "rejected" }),
    ]);
    res.json({ total, pending, approved, rejected });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
