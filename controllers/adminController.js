const User = require("../models/User");
const Ride = require("../models/Ride");

// ── STATS ──
exports.getStats = async (req, res) => {
  try {
    const [totalUsers, totalDrivers, totalRides, completedRides, activeRides, revenue] = await Promise.all([
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "driver" }),
      Ride.countDocuments(),
      Ride.countDocuments({ status: "completed" }),
      Ride.countDocuments({ status: { $in: ["accepted", "ongoing"] } }),
      Ride.aggregate([{ $match: { status: "completed" } }, { $group: { _id: null, total: { $sum: "$fare" } } }]),
    ]);
    const onlineDrivers = Math.floor(totalDrivers * 0.3); // placeholder
    res.json({ totalUsers, totalDrivers, totalRides, completedRides, activeRides, onlineDrivers, revenue: revenue[0]?.total || 0 });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

// ── USERS ──
exports.getAllUsers = async (req, res) => {
  try {
    const { role, search } = req.query;
    const filter = { role: { $ne: "admin" } };
    if (role) filter.role = role;
    if (search) filter.$or = [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }];
    const users = await User.find(filter).select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.blockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    user.blocked = !user.blocked;
    await user.save();
    res.json({ blocked: user.blocked, msg: user.blocked ? "User blocked" : "User unblocked" });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

exports.verifyDriver = async (req, res) => {
  try {
    const { status } = req.body; // "approved" | "rejected"
    const user = await User.findByIdAndUpdate(req.params.id, { verified: status }, { returnDocument: 'after' });
    res.json(user);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

// ── RIDES ──
exports.getAllRides = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const rides = await Ride.find(filter)
      .populate("user", "name email phone")
      .populate("driver", "name email phone")
      .sort({ createdAt: -1 }).limit(100);
    res.json(rides);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

// ── PRICING / SURGE ──
const surgeZones = [];
exports.getSurge = (req, res) => res.json(surgeZones);
exports.setSurge = (req, res) => {
  const { area, multiplier } = req.body;
  const idx = surgeZones.findIndex(z => z.area === area);
  if (idx >= 0) surgeZones[idx].multiplier = multiplier;
  else surgeZones.push({ area, multiplier, createdAt: new Date() });
  res.json({ msg: "Surge updated", surgeZones });
};
exports.removeSurge = (req, res) => {
  const idx = surgeZones.findIndex(z => z.area === req.params.area);
  if (idx >= 0) surgeZones.splice(idx, 1);
  res.json({ msg: "Surge removed" });
};

// ── COUPONS ──
const coupons = [
  { code: "WELCOME50", discount: 50, type: "flat", uses: 0, active: true },
  { code: "RIDE20", discount: 20, type: "percent", uses: 12, active: true },
];
exports.getCoupons = (req, res) => res.json(coupons);
exports.createCoupon = (req, res) => {
  const { code, discount, type } = req.body;
  if (coupons.find(c => c.code === code)) return res.status(400).json({ msg: "Code exists" });
  coupons.push({ code, discount, type, uses: 0, active: true });
  res.json({ msg: "Coupon created", coupons });
};
exports.toggleCoupon = (req, res) => {
  const c = coupons.find(c => c.code === req.params.code);
  if (!c) return res.status(404).json({ msg: "Not found" });
  c.active = !c.active;
  res.json(c);
};

// ── NOTIFICATIONS BROADCAST ──
exports.broadcast = async (req, res) => {
  try {
    const { target, title, message } = req.body; // target: "all" | "users" | "drivers"
    const filter = target === "users" ? { role: "user" } : target === "drivers" ? { role: "driver" } : {};
    const count = await User.countDocuments(filter);
    // In production: send push/SMS to all matched users
    console.log(`Broadcast to ${count} ${target}: [${title}] ${message}`);
    res.json({ msg: `Broadcast sent to ${count} ${target}`, count });
  } catch (err) { res.status(500).json({ msg: err.message }); }
};

// ── SUPPORT TICKETS ──
const tickets = [];
exports.getTickets = (req, res) => res.json(tickets);
exports.resolveTicket = (req, res) => {
  const t = tickets.find(t => t.id === req.params.id);
  if (t) t.status = "resolved";
  res.json({ msg: "Ticket resolved" });
};

// ── PAYOUTS ──
exports.getPayouts = async (req, res) => {
  try {
    const drivers = await User.find({ role: "driver" }).select("name email wallet");
    res.json(drivers);
  } catch (err) { res.status(500).json({ msg: err.message }); }
};
