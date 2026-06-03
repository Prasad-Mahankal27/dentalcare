const express = require("express");
const { authMiddleware } = require("../auth");
const generateAppointmentId = require("../utils/appointmentId");
const generatePatientId = require("../utils/patientId");
const generateVisitId = require("../utils/visitId");
const { prisma } = require("../db/prisma");
const { getActiveClinicContext, runSyncCycle } = require("../sync/engine");
const appEmitter = require("../utils/emitter");
const {
  isRemoteSyncConfigured,
  upsertRemotePatientFromAppointment
} = require("../sync/remoteAuth");
const {
  SubscriptionLimitError,
  SubscriptionServiceUnavailableError,
  assertCanCreatePatientForClinic
} = require("../subscription/service");
const router = express.Router();

const ACTIVE_APPOINTMENT_STATUSES = ["REQUESTED", "CONFIRMED"];
const ALLOWED_UI_STATUSES = ["REQUESTED", "CONFIRMED", "COMPLETED"];
const ALLOWED_GENDERS = ["Male", "Female", "Other"];
const UI_STATUS_FILTER_MAP = {
  pending: ["REQUESTED"],
  confirmed: ["CONFIRMED"],
  completed: ["COMPLETED"]
};
const SLOT_MINUTES = 20;
const DEFAULT_SLOT_DAYS = 2;
const DEFAULT_SLOT_LIMIT = 8;
const WORKING_HOUR_START = 10;
const WORKING_HOUR_END = 18;
const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || "http://localhost:5000";

async function sendWhatsAppText(to, text) {
  if (!to || !text) {
    return;
  }

  const baseUrl = String(WHATSAPP_SERVICE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${baseUrl}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ to, text }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn("WhatsApp notify failed:", response.status, body);
    }
  } catch (error) {
    console.warn("WhatsApp notify error:", error?.message || error);
  } finally {
    clearTimeout(timeout);
  }
}

function parsePositiveInt(rawValue, fallback, minValue, maxValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < minValue || parsed > maxValue) {
    return fallback;
  }

  return parsed;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSlotDisplay(slotDate) {
  return slotDate.toLocaleString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

function buildSlotCandidates(requestedDate, numberOfDays, slotMinutes) {
  const candidates = [];
  const firstDay = startOfDay(requestedDate);

  for (let dayIndex = 0; dayIndex < numberOfDays; dayIndex += 1) {
    const dayStart = new Date(firstDay);
    dayStart.setDate(firstDay.getDate() + dayIndex);

    const slotCursor = new Date(dayStart);
    slotCursor.setHours(WORKING_HOUR_START, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(WORKING_HOUR_END, 0, 0, 0);

    while (slotCursor < dayEnd) {
      candidates.push(new Date(slotCursor));
      slotCursor.setMinutes(slotCursor.getMinutes() + slotMinutes);
    }
  }

  return candidates;
}

function hasSlotOverlap(existingStart, requestedStart, slotMinutes) {
  const durationMs = slotMinutes * 60 * 1000;
  const existingStartMs = new Date(existingStart).getTime();
  const requestedStartMs = new Date(requestedStart).getTime();
  const existingEndMs = existingStartMs + durationMs;
  const requestedEndMs = requestedStartMs + durationMs;

  return existingStartMs < requestedEndMs && existingEndMs > requestedStartMs;
}

async function findConflictingAppointment(scheduledAt, doctorId, excludedAppointmentId) {
  const durationMs = SLOT_MINUTES * 60 * 1000;
  const rangeStart = new Date(scheduledAt.getTime() - durationMs);
  const rangeEnd = new Date(scheduledAt.getTime() + durationMs);

  const potentialConflicts = await prisma.appointment.findMany({
    where: {
      scheduledAt: {
        gt: rangeStart,
        lt: rangeEnd
      },
      status: { in: ACTIVE_APPOINTMENT_STATUSES },
      ...(doctorId ? { doctorId } : {}),
      ...(excludedAppointmentId ? { appointmentId: { not: excludedAppointmentId } } : {})
    },
    select: {
      appointmentId: true,
      scheduledAt: true
    }
  });

  return potentialConflicts.find((existing) =>
    hasSlotOverlap(existing.scheduledAt, scheduledAt, SLOT_MINUTES)
  );
}

function parseDateTime(input) {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function parseDoctorId(rawDoctorId) {
  if (rawDoctorId === undefined || rawDoctorId === null || rawDoctorId === "") {
    return null;
  }

  const doctorId = Number(rawDoctorId);
  if (!Number.isInteger(doctorId) || doctorId <= 0) {
    return null;
  }

  return doctorId;
}

function normalizePhone(rawPhone) {
  return String(rawPhone || "").replace(/\D/g, "");
}

function normalizeGender(rawGender) {
  const normalized = String(rawGender || "").trim().toLowerCase();

  if (normalized === "male" || normalized === "m") {
    return "Male";
  }

  if (normalized === "female" || normalized === "f") {
    return "Female";
  }

  if (normalized === "other" || normalized === "o") {
    return "Other";
  }

  return null;
}

function parsePatientAge(rawAge) {
  const age = Number(rawAge);
  if (!Number.isInteger(age) || age < 1 || age > 120) {
    return null;
  }
  return age;
}

function parseAppointmentIntake(payload) {
  const patientName = String(payload.name || "").trim();
  const normalizedPhone = normalizePhone(payload.phone);
  const patientAge = parsePatientAge(payload.age);
  const patientGender = normalizeGender(payload.gender);
  const patientAddress = String(payload.address || "").trim() || null;
  const complaint = String(payload.reason ?? payload.chiefComplaint ?? "").trim();
  const scheduledAt = parseDateTime(payload.preferredDateTime);

  if (!patientName) {
    return { error: "name is required" };
  }

  if (!normalizedPhone || normalizedPhone.length < 10) {
    return { error: "phone must contain at least 10 digits" };
  }

  if (!patientAge) {
    return { error: "age must be an integer between 1 and 120" };
  }

  if (!patientGender || !ALLOWED_GENDERS.includes(patientGender)) {
    return { error: "gender must be Male, Female, or Other" };
  }

  if (!complaint) {
    return { error: "chief complaint/reason is required" };
  }

  if (!scheduledAt) {
    return {
      error: "Invalid preferredDateTime. Use ISO datetime (for example: 2026-04-20T10:30:00+05:30)"
    };
  }

  if (scheduledAt <= new Date()) {
    return { error: "preferredDateTime must be in the future" };
  }

  return {
    value: {
      patientName,
      patientPhone: normalizedPhone,
      patientAge,
      patientGender,
      patientAddress,
      complaint,
      scheduledAt
    }
  };
}

function resolveStatusFilter(rawStatus) {
  if (!rawStatus) {
    return [...ALLOWED_UI_STATUSES];
  }

  const requestedStatuses = String(rawStatus)
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (!requestedStatuses.length) {
    return [...ALLOWED_UI_STATUSES];
  }

  const mappedStatuses = requestedStatuses.flatMap((status) => {
    if (UI_STATUS_FILTER_MAP[status]) {
      return UI_STATUS_FILTER_MAP[status];
    }

    const upperStatus = status.toUpperCase();
    return ALLOWED_UI_STATUSES.includes(upperStatus) ? [upperStatus] : [];
  });

  return [...new Set(mappedStatuses)];
}

function hasValidIntegrationSecret(req) {
  const expected = process.env.WHATSAPP_BOOKING_SECRET;
  if (!expected) {
    return false;
  }

  const provided = req.headers["x-whatsapp-booking-secret"];
  return typeof provided === "string" && provided === expected;
}

async function resolveDoctor(doctorId) {
  if (!doctorId) {
    return null;
  }

  const doctor = await prisma.user.findFirst({
    where: { id: doctorId, role: "DOCTOR" },
    select: { id: true }
  });

  return doctor || null;
}

async function resolveClinicIdForRequest(req) {
  const requesterId = Number(req.user?.id);
  if (Number.isInteger(requesterId) && requesterId > 0) {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { clinicId: true }
    });

    const requesterClinicId = String(requester?.clinicId || "").trim();
    if (requesterClinicId) {
      return requesterClinicId;
    }
  }

  const activeClinicContext = await getActiveClinicContext();
  const clinicId = String(activeClinicContext?.clinicId || "").trim();
  return clinicId || null;
}

async function upsertPatientFromIntake(intake, db = prisma, options = {}) {
  const clinicId = String(options?.clinicId || "").trim() || null;
  const enforcePatientLimit = options?.enforcePatientLimit === true;

  if (!clinicId) {
    throw new SubscriptionLimitError(
      "Clinic setup is incomplete. Please complete admin setup before adding patients.",
      {
        reasonCodes: ["CLINIC_UNLINKED"],
        outOfLimit: true
      },
      409
    );
  }

  const possiblePhones = [intake.patientPhone];

  let patient = await db.patient.findFirst({
    where: {
      clinicId,
      OR: possiblePhones.map((phone) => ({ phone }))
    },
    select: {
      id: true,
      patientId: true,
      name: true,
      phone: true,
      age: true,
      gender: true,
      address: true
    }
  });

  if (!patient) {
    patient = await db.patient.findFirst({
      where: {
        clinicId: null,
        OR: possiblePhones.map((phone) => ({ phone }))
      },
      select: {
        id: true,
        patientId: true,
        name: true,
        phone: true,
        age: true,
        gender: true,
        address: true
      }
    });
  }

  if (!patient) {
    if (enforcePatientLimit) {
      await assertCanCreatePatientForClinic(clinicId);
    }

    return db.patient.create({
      data: {
        patientId: generatePatientId(),
        clinicId,
        name: intake.patientName,
        phone: intake.patientPhone,
        age: intake.patientAge,
        gender: intake.patientGender,
        address: intake.patientAddress
      },
      select: {
        id: true,
        patientId: true,
        name: true,
        phone: true,
        age: true,
        gender: true,
        address: true
      }
    });
  }

  return db.patient.update({
    where: { id: patient.id },
    data: {
      clinicId,
      name: intake.patientName,
      phone: intake.patientPhone,
      age: intake.patientAge,
      gender: intake.patientGender,
      address: intake.patientAddress
    },
    select: {
      id: true,
      patientId: true,
      name: true,
      phone: true,
      age: true,
      gender: true,
      address: true
    }
  });
}

async function createAppointmentWithPatient(intake, options = {}) {
  const {
    doctorId = null,
    status = "REQUESTED",
    source = "FRONT_DESK",
    reason = null,
    whatsappMessageId = null,
    clinicId = null
  } = options;

  return prisma.$transaction(async (db) => {
    const patient = await upsertPatientFromIntake(intake, db, {
      clinicId,
      enforcePatientLimit: true
    });
    const appointment = await db.appointment.create({
      data: {
        appointmentId: generateAppointmentId(),
        patientId: patient.id,
        doctorId,
        patientPhone: intake.patientPhone,
        patientName: intake.patientName,
        patientAge: intake.patientAge,
        patientGender: intake.patientGender,
        patientAddress: intake.patientAddress,
        scheduledAt: intake.scheduledAt,
        status,
        source,
        reason,
        whatsappMessageId
      }
    });

    return { patient, appointment };
  }, { timeout: 15000 });
}

router.get("/", authMiddleware(["DOCTOR", "RECEPTIONIST"]), async (req, res) => {
  try {
    const parsedDoctorId = parseDoctorId(req.query.doctorId);
    if (req.query.doctorId !== undefined && req.query.doctorId !== null && req.query.doctorId !== "" && !parsedDoctorId) {
      return res.status(400).json({ message: "doctorId must be a positive integer" });
    }

    const statuses = resolveStatusFilter(req.query.status);
    if (!statuses.length) {
      return res.status(400).json({ message: "Invalid status filter. Use pending, confirmed, or completed" });
    }

    const limit = parsePositiveInt(req.query.limit, 200, 1, 500);
    const isCompletedOnlyFilter = statuses.length === 1 && statuses[0] === "COMPLETED";

    const appointments = await prisma.appointment.findMany({
      where: {
        status: { in: statuses },
        ...(parsedDoctorId ? { doctorId: parsedDoctorId } : {})
      },
      include: {
        patient: {
          select: {
            patientId: true,
            name: true,
            phone: true
          }
        },
        doctor: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: isCompletedOnlyFilter
        ? [
            { updatedAt: "desc" },
            { scheduledAt: "desc" }
          ]
        : {
            scheduledAt: "asc"
          },
      take: limit
    });

    return res.json({
      count: appointments.length,
      statuses,
      appointments
    });
  } catch (err) {
    console.error("Appointment list error:", err);
    return res.status(500).json({ message: "Failed to list appointments" });
  }
});

router.post("/reception/book", authMiddleware(["RECEPTIONIST"]), async (req, res) => {
  try {
    const parsedDoctorId = parseDoctorId(req.body?.doctorId);
    if (req.body?.doctorId !== undefined && req.body?.doctorId !== null && req.body?.doctorId !== "" && !parsedDoctorId) {
      return res.status(400).json({ message: "doctorId must be a positive integer" });
    }

    if (parsedDoctorId) {
      const doctor = await resolveDoctor(parsedDoctorId);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor not found" });
      }
    }

    const parsedIntake = parseAppointmentIntake(req.body || {});
    if (parsedIntake.error) {
      return res.status(400).json({ message: parsedIntake.error });
    }

    const intake = parsedIntake.value;
    const conflictingAppointment = await findConflictingAppointment(intake.scheduledAt, parsedDoctorId, null);
    if (conflictingAppointment) {
      return res.status(409).json({
        message: "Requested slot is already booked",
        conflictingAppointmentId: conflictingAppointment.appointmentId
      });
    }

    const clinicId = await resolveClinicIdForRequest(req);
    if (!clinicId) {
      return res.status(409).json({
        message: "Clinic setup is incomplete. Please complete admin setup before booking appointments."
      });
    }

    const existingPatientBeforeCreate = await prisma.patient.findFirst({
      where: {
        OR: [{ clinicId }, { clinicId: null }],
        phone: intake.patientPhone
      },
      select: { id: true }
    });

    const { patient, appointment } = await createAppointmentWithPatient(intake, {
      doctorId: parsedDoctorId,
      status: "CONFIRMED",
      source: "FRONT_DESK",
      reason: intake.complaint,
      clinicId
    });

    if (isRemoteSyncConfigured()) {
      try {
        await upsertRemotePatientFromAppointment({
          clinicId,
          patient,
          appointment
        });
      } catch (syncError) {
        await prisma.appointment
          .delete({ where: { id: appointment.id } })
          .catch(() => null);

        if (!existingPatientBeforeCreate?.id) {
          const [remainingAppointments, remainingVisits] = await Promise.all([
            prisma.appointment.count({ where: { patientId: patient.id } }),
            prisma.visit.count({ where: { patientId: patient.id } })
          ]);

          if (remainingAppointments === 0 && remainingVisits === 0) {
            await prisma.patient
              .delete({ where: { id: patient.id } })
              .catch(() => null);
          }
        }

        return res.status(502).json({
          message: "Appointment sync to Supabase failed. Local appointment changes were rolled back.",
          appointmentId: appointment.appointmentId,
          details: String(syncError?.message || syncError || "Supabase sync failed")
        });
      }
    }

    appEmitter.emit("appointments-changed", { action: "book", appointmentId: appointment.appointmentId });

    void runSyncCycle().catch((syncError) => {
      console.warn("Reception appointment sync warning:", syncError?.message || syncError);
    });

    return res.status(201).json({
      appointmentId: appointment.appointmentId,
      status: appointment.status,
      scheduledAt: appointment.scheduledAt,
      patientId: patient.patientId,
      doctorId: appointment.doctorId
    });
  } catch (err) {
    if (err instanceof SubscriptionServiceUnavailableError) {
      return res.status(err.statusCode).json(err.payload);
    }

    if (err instanceof SubscriptionLimitError) {
      return res.status(err.statusCode).json(err.payload);
    }

    console.error("Reception appointment booking error:", err);
    return res.status(500).json({ message: "Failed to book appointment" });
  }
});

router.get("/whatsapp/available-slots", async (req, res) => {
  try {
    if (!hasValidIntegrationSecret(req)) {
      return res.status(401).json({ message: "Unauthorized integration request" });
    }

    const { date, doctorId, excludeAppointmentId } = req.query;
    const days = parsePositiveInt(req.query.days, DEFAULT_SLOT_DAYS, 1, 7);
    const limit = parsePositiveInt(req.query.limit, DEFAULT_SLOT_LIMIT, 1, 30);

    const requestedDate = date ? new Date(`${date}T00:00:00`) : new Date();
    if (Number.isNaN(requestedDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format. Expected YYYY-MM-DD" });
    }

    const parsedDoctorId = parseDoctorId(doctorId);
    if (doctorId !== undefined && doctorId !== null && doctorId !== "" && !parsedDoctorId) {
      return res.status(400).json({ message: "doctorId must be a positive integer" });
    }

    const excludedAppointmentId =
      excludeAppointmentId === undefined || excludeAppointmentId === null || String(excludeAppointmentId).trim() === ""
        ? null
        : String(excludeAppointmentId).trim();

    const slotCandidates = buildSlotCandidates(requestedDate, days, SLOT_MINUTES);
    if (!slotCandidates.length) {
      return res.json({
        slotMinutes: SLOT_MINUTES,
        days,
        requestedDate: toIsoDate(requestedDate),
        slots: []
      });
    }

    const windowStart = slotCandidates[0];
    const windowEnd = new Date(slotCandidates[slotCandidates.length - 1]);
    windowEnd.setMinutes(windowEnd.getMinutes() + SLOT_MINUTES);

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        scheduledAt: {
          gte: windowStart,
          lt: windowEnd
        },
        status: { in: ACTIVE_APPOINTMENT_STATUSES },
        ...(excludedAppointmentId ? { appointmentId: { not: excludedAppointmentId } } : {}),
        ...(parsedDoctorId ? { doctorId: parsedDoctorId } : {})
      },
      select: {
        scheduledAt: true
      }
    });

    const now = new Date();
    const slots = [];

    for (const slotDate of slotCandidates) {
      if (slotDate <= now) {
        continue;
      }

      const isBlocked = existingAppointments.some((appointment) =>
        hasSlotOverlap(appointment.scheduledAt, slotDate, SLOT_MINUTES)
      );

      if (!isBlocked) {
        slots.push({
          iso: slotDate.toISOString(),
          date: toIsoDate(slotDate),
          display: formatSlotDisplay(slotDate)
        });
      }

      if (slots.length >= limit) {
        break;
      }
    }

    return res.json({
      slotMinutes: SLOT_MINUTES,
      days,
      requestedDate: toIsoDate(requestedDate),
      doctorId: parsedDoctorId,
      excludeAppointmentId: excludedAppointmentId,
      slots
    });
  } catch (err) {
    console.error("Available slot fetch error:", err);
    return res.status(500).json({ message: "Failed to fetch available slots" });
  }
});

router.get("/whatsapp/upcoming", async (req, res) => {
  try {
    if (!hasValidIntegrationSecret(req)) {
      return res.status(401).json({ message: "Unauthorized integration request" });
    }

    const normalizedPhone = normalizePhone(req.query.phone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
      return res.status(400).json({ message: "phone query param must contain at least 10 digits" });
    }

    const limit = parsePositiveInt(req.query.limit, 5, 1, 10);
    const now = new Date();

    const appointments = await prisma.appointment.findMany({
      where: {
        patientPhone: normalizedPhone,
        status: { in: ACTIVE_APPOINTMENT_STATUSES },
        scheduledAt: {
          gt: now
        }
      },
      select: {
        appointmentId: true,
        scheduledAt: true,
        status: true,
        reason: true,
        doctorId: true
      },
      orderBy: {
        scheduledAt: "asc"
      },
      take: limit
    });

    return res.json({
      count: appointments.length,
      appointments
    });
  } catch (err) {
    console.error("WhatsApp upcoming appointments error:", err);
    return res.status(500).json({ message: "Failed to fetch upcoming appointments" });
  }
});

router.post("/whatsapp/reschedule", async (req, res) => {
  try {
    if (!hasValidIntegrationSecret(req)) {
      return res.status(401).json({ message: "Unauthorized integration request" });
    }

    const normalizedPhone = normalizePhone(req.body?.phone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
      return res.status(400).json({ message: "phone must contain at least 10 digits" });
    }

    const appointmentId = String(req.body?.appointmentId || "").trim();
    if (!appointmentId) {
      return res.status(400).json({ message: "appointmentId is required" });
    }

    const newScheduledAt = parseDateTime(req.body?.preferredDateTime);
    if (!newScheduledAt) {
      return res.status(400).json({
        message: "Invalid preferredDateTime. Use ISO datetime (for example: 2026-04-20T10:30:00+05:30)"
      });
    }

    if (newScheduledAt <= new Date()) {
      return res.status(400).json({ message: "preferredDateTime must be in the future" });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { appointmentId },
      select: {
        appointmentId: true,
        patientPhone: true,
        scheduledAt: true,
        status: true,
        doctorId: true
      }
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (normalizePhone(appointment.patientPhone) !== normalizedPhone) {
      return res.status(403).json({ message: "You can only reschedule your own appointment" });
    }

    if (!ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status)) {
      return res.status(409).json({
        message: `Cannot reschedule appointment with status ${appointment.status}`
      });
    }

    const conflictingAppointment = await findConflictingAppointment(
      newScheduledAt,
      appointment.doctorId,
      appointment.appointmentId
    );

    if (conflictingAppointment) {
      return res.status(409).json({
        message: "Requested slot is already booked",
        conflictingAppointmentId: conflictingAppointment.appointmentId
      });
    }

    const updated = await prisma.appointment.update({
      where: { appointmentId },
      data: {
        scheduledAt: newScheduledAt,
        status: "CONFIRMED",
        ...(req.body?.whatsappMessageId
          ? { whatsappMessageId: String(req.body.whatsappMessageId) }
          : {})
      }
    });

    appEmitter.emit("appointments-changed", { action: "reschedule", appointmentId: updated.appointmentId });

    void runSyncCycle().catch((syncError) => {
      console.warn("WhatsApp reschedule appointment sync warning:", syncError?.message || syncError);
    });

    return res.json({
      message: "Appointment rescheduled",
      appointmentId: updated.appointmentId,
      previousScheduledAt: appointment.scheduledAt,
      scheduledAt: updated.scheduledAt,
      status: updated.status
    });
  } catch (err) {
    console.error("WhatsApp appointment reschedule error:", err);
    return res.status(500).json({ message: "Failed to reschedule appointment" });
  }
});

router.post("/whatsapp/request", async (req, res) => {
  try {
    if (!hasValidIntegrationSecret(req)) {
      return res.status(401).json({ message: "Unauthorized integration request" });
    }

    const { doctorId, whatsappMessageId, status } = req.body || {};

    const parsedDoctorId = parseDoctorId(doctorId);
    if (doctorId !== undefined && doctorId !== null && doctorId !== "" && !parsedDoctorId) {
      return res.status(400).json({ message: "doctorId must be a positive integer" });
    }

    if (parsedDoctorId) {
      const doctor = await resolveDoctor(parsedDoctorId);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor not found" });
      }
    }

    const parsedIntake = parseAppointmentIntake(req.body || {});
    if (parsedIntake.error) {
      return res.status(400).json({ message: parsedIntake.error });
    }

    const intake = parsedIntake.value;

    let requestedStatus = "REQUESTED";
    if (status !== undefined && status !== null && status !== "") {
      const normalizedStatus = String(status).toUpperCase();
      if (!["REQUESTED", "CONFIRMED"].includes(normalizedStatus)) {
        return res.status(400).json({ message: "status must be REQUESTED or CONFIRMED" });
      }
      requestedStatus = normalizedStatus;
    }

    const conflictingAppointment = await findConflictingAppointment(intake.scheduledAt, parsedDoctorId, null);

    if (conflictingAppointment) {
      return res.status(409).json({
        message: "Requested slot is already booked",
        conflictingAppointmentId: conflictingAppointment.appointmentId
      });
    }

    const clinicId = await getActiveClinicContext().then((context) =>
      String(context?.clinicId || "").trim() || null
    );

    if (!clinicId) {
      return res.status(409).json({
        message: "Clinic setup is incomplete. Please complete admin setup before booking appointments."
      });
    }

    const existingPatientBeforeCreate = await prisma.patient.findFirst({
      where: {
        OR: [{ clinicId }, { clinicId: null }],
        phone: intake.patientPhone
      },
      select: { id: true }
    });

    const { patient, appointment } = await createAppointmentWithPatient(intake, {
      doctorId: parsedDoctorId,
      status: requestedStatus,
      source: "WHATSAPP",
      reason: intake.complaint,
      whatsappMessageId: whatsappMessageId || null,
      clinicId
    });

    if (isRemoteSyncConfigured()) {
      try {
        await upsertRemotePatientFromAppointment({
          clinicId,
          patient,
          appointment
        });
      } catch (syncError) {
        await prisma.appointment
          .delete({ where: { id: appointment.id } })
          .catch(() => null);

        if (!existingPatientBeforeCreate?.id) {
          const [remainingAppointments, remainingVisits] = await Promise.all([
            prisma.appointment.count({ where: { patientId: patient.id } }),
            prisma.visit.count({ where: { patientId: patient.id } })
          ]);

          if (remainingAppointments === 0 && remainingVisits === 0) {
            await prisma.patient
              .delete({ where: { id: patient.id } })
              .catch(() => null);
          }
        }

        return res.status(502).json({
          message: "Appointment sync to Supabase failed. Local appointment changes were rolled back.",
          appointmentId: appointment.appointmentId,
          details: String(syncError?.message || syncError || "Supabase sync failed")
        });
      }
    }

    appEmitter.emit("appointments-changed", { action: "request", appointmentId: appointment.appointmentId });

    void runSyncCycle().catch((syncError) => {
      console.warn("WhatsApp appointment sync warning:", syncError?.message || syncError);
    });

    return res.status(201).json({
      appointmentId: appointment.appointmentId,
      status: appointment.status,
      scheduledAt: appointment.scheduledAt,
      patientMatched: true,
      linkedPatientId: patient.patientId
    });
  } catch (err) {
    if (err instanceof SubscriptionServiceUnavailableError) {
      return res.status(err.statusCode).json(err.payload);
    }

    if (err instanceof SubscriptionLimitError) {
      return res.status(err.statusCode).json(err.payload);
    }

    console.error("WhatsApp appointment request error:", err);
    return res.status(500).json({ message: "Failed to create appointment request" });
  }
});

router.get("/day", authMiddleware(["DOCTOR", "RECEPTIONIST"]), async (req, res) => {
  try {
    const { date, doctorId } = req.query;
    if (!date) {
      return res.status(400).json({ message: "date query param is required (YYYY-MM-DD)" });
    }

    const dayStart = new Date(`${date}T00:00:00`);
    if (Number.isNaN(dayStart.getTime())) {
      return res.status(400).json({ message: "Invalid date format. Expected YYYY-MM-DD" });
    }
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const parsedDoctorId = parseDoctorId(doctorId);
    if (doctorId !== undefined && doctorId !== null && doctorId !== "" && !parsedDoctorId) {
      return res.status(400).json({ message: "doctorId must be a positive integer" });
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        scheduledAt: {
          gte: dayStart,
          lt: dayEnd
        },
        ...(parsedDoctorId ? { doctorId: parsedDoctorId } : {})
      },
      include: {
        patient: {
          select: {
            patientId: true,
            name: true,
            phone: true
          }
        },
        doctor: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        scheduledAt: "asc"
      }
    });

    return res.json({
      date,
      count: appointments.length,
      appointments
    });
  } catch (err) {
    console.error("Appointment listing error:", err);
    return res.status(500).json({ message: "Failed to list appointments" });
  }
});

router.get("/events", authMiddleware(), (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });
  
  // Heartbeat message to establish connection
  res.write("data: {}\n\n");

  const listener = (data) => {
    res.write(`event: appointments-changed\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  appEmitter.on("appointments-changed", listener);

  req.on("close", () => {
    appEmitter.off("appointments-changed", listener);
  });
});

router.get("/:appointmentId", authMiddleware(["DOCTOR", "RECEPTIONIST"]), async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await prisma.appointment.findUnique({
      where: { appointmentId },
      include: {
        patient: {
          select: {
            id: true,
            patientId: true,
            name: true,
            phone: true,
            age: true,
            gender: true,
            address: true
          }
        },
        doctor: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    return res.json(appointment);
  } catch (err) {
    console.error("Appointment detail fetch error:", err);
    return res.status(500).json({ message: "Failed to fetch appointment details" });
  }
});

router.post("/:appointmentId/start-visit", authMiddleware(["DOCTOR"]), async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const visitType = req.body?.visitType === "FOLLOW_UP" ? "FOLLOW_UP" : "NEW";

    const appointment = await prisma.appointment.findUnique({
      where: { appointmentId },
      include: {
        patient: {
          select: {
            id: true,
            patientId: true,
            name: true,
            phone: true,
            age: true,
            gender: true,
            address: true
          }
        }
      }
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appointment.status)) {
      return res.status(409).json({
        message: `Cannot start visit for appointment status ${appointment.status}`
      });
    }

    if (appointment.linkedVisitId) {
      return res.json({
        message: "Visit already started for this appointment",
        visitId: appointment.linkedVisitId,
        appointmentId,
        alreadyStarted: true
      });
    }

    let patient = appointment.patient;
    if (!patient) {
      const clinicId = await resolveClinicIdForRequest(req);
      if (!clinicId) {
        return res.status(409).json({
          message: "Clinic setup is incomplete. Please complete admin setup before starting visit."
        });
      }

      const age = parsePatientAge(appointment.patientAge);
      const gender = normalizeGender(appointment.patientGender);
      const phone = normalizePhone(appointment.patientPhone);

      if (!appointment.patientName || !phone || !age || !gender) {
        return res.status(409).json({
          message: "Appointment is missing required patient fields (name, phone, age, gender)"
        });
      }

      patient = await upsertPatientFromIntake({
        patientName: appointment.patientName,
        patientPhone: phone,
        patientAge: age,
        patientGender: gender,
        patientAddress: appointment.patientAddress || null
      }, prisma, {
        clinicId,
        enforcePatientLimit: true
      });
    }

    const visit = await prisma.visit.create({
      data: {
        visitId: generateVisitId(),
        patientId: patient.id,
        doctorId: req.user.id,
        visitType
      }
    });

    await prisma.appointment.update({
      where: { appointmentId },
      data: {
        patientId: patient.id,
        doctorId: req.user.id,
        status: "CONFIRMED",
        linkedVisitId: visit.visitId
      }
    });

    appEmitter.emit("appointments-changed", { action: "start-visit", appointmentId });

    void runSyncCycle().catch((syncError) => {
      console.warn("Start visit sync warning:", syncError?.message || syncError);
    });

    return res.json({
      message: "Visit started from appointment",
      visitId: visit.visitId,
      appointmentId,
      alreadyStarted: false
    });
  } catch (err) {
    if (err instanceof SubscriptionServiceUnavailableError) {
      return res.status(err.statusCode).json(err.payload);
    }

    if (err instanceof SubscriptionLimitError) {
      return res.status(err.statusCode).json(err.payload);
    }

    console.error("Start visit from appointment error:", err);
    return res.status(500).json({ message: "Failed to start visit from appointment" });
  }
});

router.post("/:appointmentId/confirm", authMiddleware(["DOCTOR", "RECEPTIONIST"]), async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await prisma.appointment.findUnique({
      where: { appointmentId }
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appointment.status)) {
      return res.status(409).json({ message: `Cannot confirm an appointment with status ${appointment.status}` });
    }

    const rawDoctorId = req.body?.doctorId;
    const requestDoctorId = parseDoctorId(rawDoctorId);
    if (rawDoctorId !== undefined && rawDoctorId !== null && rawDoctorId !== "" && !requestDoctorId) {
      return res.status(400).json({ message: "doctorId must be a positive integer" });
    }

    const finalDoctorId =
      requestDoctorId ||
      appointment.doctorId ||
      (req.user.role === "DOCTOR" ? req.user.id : null);

    if (finalDoctorId) {
      const conflictingAppointment = await findConflictingAppointment(
        appointment.scheduledAt,
        finalDoctorId,
        appointment.appointmentId
      );

      if (conflictingAppointment) {
        return res.status(409).json({
          message: "Doctor already has an appointment in this slot",
          conflictingAppointmentId: conflictingAppointment.appointmentId
        });
      }
    }

    const updated = await prisma.appointment.update({
      where: { appointmentId },
      data: {
        status: "CONFIRMED",
        doctorId: finalDoctorId
      }
    });

    appEmitter.emit("appointments-changed", { action: "confirm", appointmentId: updated.appointmentId });

    void runSyncCycle().catch((syncError) => {
      console.warn("Confirm appointment sync warning:", syncError?.message || syncError);
    });

    return res.json({
      message: "Appointment confirmed",
      appointmentId: updated.appointmentId,
      status: updated.status,
      doctorId: updated.doctorId
    });
  } catch (err) {
    console.error("Appointment confirm error:", err);
    return res.status(500).json({ message: "Failed to confirm appointment" });
  }
});

router.post("/:appointmentId/cancel", authMiddleware(["DOCTOR", "RECEPTIONIST"]), async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { appointmentId },
      select: { appointmentId: true, status: true }
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (appointment.status === "CANCELLED") {
      return res.status(409).json({ message: "Appointment is already cancelled" });
    }

    const updated = await prisma.appointment.update({
      where: { appointmentId },
      data: {
        status: "CANCELLED"
      }
    });

    appEmitter.emit("appointments-changed", { action: "cancel", appointmentId: updated.appointmentId });

    void runSyncCycle().catch((syncError) => {
      console.warn("Cancel appointment sync warning:", syncError?.message || syncError);
    });

    return res.json({
      message: "Appointment cancelled",
      appointmentId: updated.appointmentId,
      status: updated.status
    });
  } catch (err) {
    console.error("Appointment cancel error:", err);
    return res.status(500).json({ message: "Failed to cancel appointment" });
  }
});

router.post("/:appointmentId/reschedule", authMiddleware(["DOCTOR", "RECEPTIONIST"]), async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const newScheduledAt = parseDateTime(req.body?.preferredDateTime);

    if (!newScheduledAt) {
      return res.status(400).json({
        message: "Invalid preferredDateTime. Use ISO datetime (for example: 2026-04-20T10:30:00+05:30)"
      });
    }

    if (newScheduledAt <= new Date()) {
      return res.status(400).json({ message: "preferredDateTime must be in the future" });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { appointmentId },
      select: {
        appointmentId: true,
        status: true,
        doctorId: true,
        scheduledAt: true,
        patientPhone: true,
        patientName: true,
        source: true
      }
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appointment.status)) {
      return res.status(409).json({
        message: `Cannot reschedule appointment with status ${appointment.status}`
      });
    }

    const rawDoctorId = req.body?.doctorId;
    const requestDoctorId = parseDoctorId(rawDoctorId);
    if (rawDoctorId !== undefined && rawDoctorId !== null && rawDoctorId !== "" && !requestDoctorId) {
      return res.status(400).json({ message: "doctorId must be a positive integer" });
    }

    const finalDoctorId =
      requestDoctorId ||
      appointment.doctorId ||
      (req.user.role === "DOCTOR" ? req.user.id : null);

    if (finalDoctorId) {
      const doctor = await resolveDoctor(finalDoctorId);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor not found" });
      }

      const conflictingAppointment = await findConflictingAppointment(
        newScheduledAt,
        finalDoctorId,
        appointment.appointmentId
      );

      if (conflictingAppointment) {
        return res.status(409).json({
          message: "Requested slot is already booked",
          conflictingAppointmentId: conflictingAppointment.appointmentId
        });
      }
    }

    const updated = await prisma.appointment.update({
      where: { appointmentId },
      data: {
        scheduledAt: newScheduledAt,
        status: "CONFIRMED",
        doctorId: finalDoctorId
      }
    });

    const normalizedPhone = normalizePhone(appointment.patientPhone);
    const shouldNotifyWhatsapp =
      req.user?.role === "RECEPTIONIST"
      && normalizedPhone
      && (appointment.source === "WHATSAPP" || req.body?.notifyWhatsApp === true);

    if (shouldNotifyWhatsapp) {
      const previousDisplay = formatSlotDisplay(new Date(appointment.scheduledAt));
      const updatedDisplay = formatSlotDisplay(new Date(updated.scheduledAt));
      const patientName = appointment.patientName ? ` ${appointment.patientName}` : "";
      const message = [
        `Hi${patientName}, your appointment has been rescheduled.`,
        `Previous: ${previousDisplay}`,
        `New: ${updatedDisplay}`,
        `Ref: ${updated.appointmentId}`
      ].join("\n");

      void sendWhatsAppText(normalizedPhone, message);
    }

    appEmitter.emit("appointments-changed", { action: "reschedule", appointmentId: updated.appointmentId });

    void runSyncCycle().catch((syncError) => {
      console.warn("Reschedule appointment sync warning:", syncError?.message || syncError);
    });

    return res.json({
      message: "Appointment rescheduled",
      appointmentId: updated.appointmentId,
      previousScheduledAt: appointment.scheduledAt,
      scheduledAt: updated.scheduledAt,
      status: updated.status,
      doctorId: updated.doctorId
    });
  } catch (err) {
    console.error("Appointment reschedule error:", err);
    return res.status(500).json({ message: "Failed to reschedule appointment" });
  }
});

router.post("/:appointmentId/complete", authMiddleware(["DOCTOR", "RECEPTIONIST"]), async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { appointmentId },
      select: {
        appointmentId: true,
        status: true
      }
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (appointment.status === "COMPLETED") {
      return res.status(409).json({ message: "Appointment is already completed" });
    }

    if (["CANCELLED", "NO_SHOW"].includes(appointment.status)) {
      return res.status(409).json({ message: `Cannot complete appointment with status ${appointment.status}` });
    }

    const updated = await prisma.appointment.update({
      where: { appointmentId },
      data: {
        status: "COMPLETED"
      }
    });

    appEmitter.emit("appointments-changed", { action: "complete", appointmentId: updated.appointmentId });

    void runSyncCycle().catch((syncError) => {
      console.warn("Complete appointment sync warning:", syncError?.message || syncError);
    });

    return res.json({
      message: "Appointment marked completed",
      appointmentId: updated.appointmentId,
      status: updated.status
    });
  } catch (err) {
    console.error("Appointment complete error:", err);
    return res.status(500).json({ message: "Failed to complete appointment" });
  }
});

router.delete("/:appointmentId", authMiddleware(["DOCTOR", "RECEPTIONIST"]), async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { appointmentId },
      select: {
        appointmentId: true,
        linkedVisitId: true
      }
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (appointment.linkedVisitId) {
      return res.status(409).json({
        message: "Cannot delete appointment linked to a visit. Cancel it instead."
      });
    }

    await prisma.appointment.delete({
      where: { appointmentId }
    });

    appEmitter.emit("appointments-changed", { action: "delete", appointmentId });

    void runSyncCycle().catch((syncError) => {
      console.warn("Delete appointment sync warning:", syncError?.message || syncError);
    });

    return res.json({
      message: "Appointment deleted",
      appointmentId
    });
  } catch (err) {
    console.error("Appointment delete error:", err);
    return res.status(500).json({ message: "Failed to delete appointment" });
  }
});

module.exports = router;
