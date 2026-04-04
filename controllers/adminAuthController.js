const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const genToken = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "8h" });

// Admin Login — requires email + password + ADMIN_SECRET key
exports.adminLogin = async (req, res) => {
  try {
    const { email, password, secretKey } = req.body;

    // 1. Validate secret key
    if (secretKey !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ msg: "Invalid admin secret key" });
    }

    // 2. Find admin user
    const user = await User.findOne({ email, role: "admin" });
    if (!user) return res.status(404).json({ msg: "Admin not found" });

    // 3. Validate password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ msg: "Wrong password" });

    // 4. Log access
    console.log(`🔐 Admin login: ${user.email} at ${new Date().toISOString()} from IP: ${req.ip}`);

    res.json({ token: genToken(user._id, "admin"), user: { id: user._id, name: user.name, email: user.email, role: "admin" } });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Create first admin (run once via seed)
exports.seedAdmin = async (req, res) => {
  try {
    const { seedKey } = req.body;
    if (seedKey !== process.env.ADMIN_SEED_KEY) return res.status(403).json({ msg: "Invalid seed key" });

    const exists = await User.findOne({ role: "admin" });
    if (exists) return res.status(400).json({ msg: "Admin already exists" });

    const hash = await bcrypt.hash(process.env.ADMIN_DEFAULT_PASS || "Admin@1234", 10);
    const admin = await User.create({
      name: "Super Admin",
      email: process.env.ADMIN_EMAIL || "admin@chalterho.com",
      password: hash,
      role: "admin",
    });

    res.json({ msg: "Admin created ✅", email: admin.email });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
