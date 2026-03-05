const jwt = require("jsonwebtoken");

const SECRET = "dentalcare_secret"; // later move to env

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    SECRET,
    { expiresIn: "1d" }
  );
}

function authMiddleware(roles = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    try {
      const decoded = jwt.verify(token, SECRET);
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
