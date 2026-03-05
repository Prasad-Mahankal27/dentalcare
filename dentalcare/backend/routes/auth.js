const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const prisma = new PrismaClient();
const SECRET = "dentalcare_secret"; 

/**
 * @route 
 * @desc    
 */
router.post("/login", async (req, res) => {
  const { phone, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { phone: String(phone) }
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid phone number or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid phone number or password" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      id: user.id,
      name: user.name,
      role: user.role
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * Middleware to protect routes based on User Roles
 * @param {Array} roles 
 */
function authMiddleware(roles = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Access denied. No token provided." });
    }

    try {
      const decoded = jwt.verify(token, SECRET);
      
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "Forbidden: Access denied" });
      }

      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ message: "Invalid or expired token" });
    }
  };
}

module.exports = router;
module.exports.authMiddleware = authMiddleware;