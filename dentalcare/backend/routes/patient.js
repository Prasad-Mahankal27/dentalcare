const express = require("express");
const { authMiddleware } = require("../auth");
const generatePatientId = require("../utils/patientId");
const { prisma } = require("../db/prisma");
const {
  SubscriptionLimitError,
  SubscriptionServiceUnavailableError,
  resolveClinicIdForUser,
  assertCanCreatePatientForClinic
} = require("../subscription/service");
const router = express.Router();

router.post(
  "/register",
  authMiddleware(["RECEPTIONIST"]),
  async (req, res) => {
    try {
      const { name, phone, age, gender, address } = req.body;

      if (!name || !phone) {
        return res.status(400).json({ message: "Name and phone required" });
      }

      const clinicId = await resolveClinicIdForUser(req.user || {});
      if (!clinicId) {
        return res.status(409).json({
          message: "Clinic setup is incomplete. Please complete admin setup before registering patients."
        });
      }

      const existing = await prisma.patient.findFirst({
        where: {
          OR: [{ clinicId }, { clinicId: null }],
          phone
        }
      });

      if (existing) {
        return res.status(409).json({
          message: "Patient already exists",
          patientId: existing.patientId
        });
      }

      await assertCanCreatePatientForClinic(clinicId);

      const patient = await prisma.patient.create({
        data: {
          patientId: generatePatientId(),
          clinicId,
          name,
          phone,
          age,
          gender,
          address
        }
      });

      return res.json(patient);
    } catch (error) {
      if (error instanceof SubscriptionServiceUnavailableError) {
        return res.status(error.statusCode).json(error.payload);
      }

      if (error instanceof SubscriptionLimitError) {
        return res.status(error.statusCode).json(error.payload);
      }

      console.error("Patient register error:", error);
      return res.status(500).json({ message: "Failed to register patient" });
    }
  }
);

router.get(
  "/search",
  authMiddleware(["RECEPTIONIST", "DOCTOR"]),
  async (req, res) => {
    const queryParam = req.query.query;
    if (Array.isArray(queryParam)) {
      return res.status(400).json({ message: "query must be a single value" });
    }
    if (queryParam && typeof queryParam === "object") {
      return res.status(400).json({ message: "query must be a string" });
    }

    const rawQuery = String(queryParam || "").trim();
    if (!rawQuery) {
      return res.status(400).json({ message: "query is required" });
    }
    const clinicId = await resolveClinicIdForUser(req.user || {});
    if (!clinicId) {
      return res.status(409).json({
        message: "Clinic setup is incomplete. Please complete admin setup before searching patients."
      });
    }

    const limit = Number(req.query.limit) || 10;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 10;

    const patients = await prisma.patient.findMany({
      where: {
        OR: [
          { clinicId },
          { clinicId: null }
        ],
        AND: [
          {
            OR: [
              { patientId: rawQuery },
              { phone: rawQuery }
            ]
          }
        ]
      },
      take: safeLimit
    });

    const likeQuery = `%${rawQuery.toLowerCase()}%`;
    const nameMatches = await prisma.$queryRaw`
      SELECT *
      FROM "Patient"
      WHERE ("clinicId" = ${clinicId} OR "clinicId" IS NULL)
        AND lower("name") LIKE ${likeQuery}
      LIMIT 100
    `;

    const appointmentLikeQuery = `%${rawQuery.toLowerCase()}%`;
    const appointmentMatches = await prisma.$queryRaw`
      SELECT "patientId", "patientName", "patientPhone"
      FROM "Appointment"
      WHERE (lower(COALESCE("patientName", "")) LIKE ${appointmentLikeQuery})
        OR "patientPhone" = ${rawQuery}
      LIMIT 100
    `;

    const appointmentPatientIds = Array.from(
      new Set(
        appointmentMatches
          .map((row) => row?.patientId)
          .filter((value) => Number.isInteger(value))
      )
    );

    const appointmentPatients = appointmentPatientIds.length
      ? await prisma.patient.findMany({
          where: { id: { in: appointmentPatientIds } }
        })
      : [];

    const uniquePatients = new Map();
    for (const patient of [...patients, ...nameMatches, ...appointmentPatients]) {
      if (patient?.id !== undefined && patient?.id !== null) {
        uniquePatients.set(patient.id, patient);
      }
    }

    const results = Array.from(uniquePatients.values())
      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "en", { sensitivity: "base" }))
      .slice(0, safeLimit);

    if (!results.length) {
      return res.status(404).json({ message: "Patient not found" });
    }

    res.json({ results, count: results.length });
  }
);

module.exports = router;
