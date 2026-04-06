const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authMiddleware } = require("../auth");
const generatePatientId = require("../utils/patientId");

const prisma = new PrismaClient();
const router = express.Router();

router.post(
  "/register",
  authMiddleware(["RECEPTIONIST"]),
  async (req, res) => {
    const { name, phone, age, gender, address } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone required" });
    }

    const existing = await prisma.patient.findFirst({
      where: { phone }
    });

    if (existing) {
      return res.status(409).json({
        message: "Patient already exists",
        patientId: existing.patientId
      });
    }

    const patient = await prisma.patient.create({
      data: {
        patientId: generatePatientId(),
        name,
        phone,
        age,
        gender,
        address
      }
    });

    res.json(patient);
  }
);

router.get(
  "/search",
  authMiddleware(["RECEPTIONIST", "DOCTOR"]),
  async (req, res) => {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ message: "Search query required" });
    }

    const trimmedQuery = query.trim();

    const patients = await prisma.patient.findMany({
      where: {
        OR: [
          { patientId: { contains: trimmedQuery } },
          { phone: { contains: trimmedQuery } },
          { name: { contains: trimmedQuery } }
        ]
      },
      take: 10
    });

    if (patients.length === 0) {
      return res.status(404).json({ message: "Patient not found" });
    }

    // If it's a single exact match for ID or Phone, return object, else array
    // However, the frontend seems to expect a single object based on findFirst
    // Let's keep it consistent but prioritize exact ID/Phone matches
    const exactMatch = patients.find(p => p.patientId === trimmedQuery || p.phone === trimmedQuery);
    res.json(exactMatch || patients[0]);
  }
);

module.exports = router;
