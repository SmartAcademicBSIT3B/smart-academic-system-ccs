const jwt = require("jsonwebtoken");

function getJwtSecret() {
  return String(process.env.JWT_SECRET || "").trim();
}

function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized." });
  }

  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    console.error("Auth middleware error: JWT_SECRET is not configured.");
    return res.status(500).json({
      success: false,
      message: "Server authentication is not configured (JWT_SECRET missing).",
    });
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch (_error) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token." });
  }
}

module.exports = { requireAuth };
