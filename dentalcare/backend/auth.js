const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./config/jwt");

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: "1d" }
  );
}

function authMiddleware(roles = []) {
  return (req, res, next) => {
    let token = req.headers.authorization?.split(" ")[1];
    if (!token && req.query.token) {
      token = req.query.token;
    }
    if (!token) return res.status(401).json({ message: "No token" });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ message: "Invalid token" });
    }
  };
}

module.exports = { generateToken, authMiddleware };
