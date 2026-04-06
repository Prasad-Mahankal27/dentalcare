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

    const patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { patientId: query },
          { phone: query }
        ]
      }
    });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    res.json(patient);
  }
);

module.exports = router;
