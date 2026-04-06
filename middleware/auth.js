const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json("No token");
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Normalize: support both old tokens (id) and any shape
    req.user = {
      id: String(decoded.id || decoded._id || ""),
      role: decoded.role,
    };
    if (!req.user.id) return res.status(401).json("Invalid token payload");
    next();
  } catch {
    res.status(401).json("Invalid token");
  }
};