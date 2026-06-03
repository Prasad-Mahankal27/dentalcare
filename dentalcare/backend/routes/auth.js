const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { prisma } = require("../db/prisma");
const { JWT_SECRET } = require("../config/jwt");
const {
  getActiveClinicContext,
  runSyncCycle,
  runSyncCyclesUntilCaughtUp,
  setActiveClinicContext
} = require("../sync/engine");
const { generateClinicId } = require("../sync/clinicContext");
const {
  findRemoteUserMatch,
  fetchRemotePatientsWithLatestAppointments,
  isRemoteSyncConfigured,
  upsertRemoteClinic,
  upsertRemoteUser
} = require("../sync/remoteAuth");
const generatePatientId = require("../utils/patientId");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /.+@.+\..+/.test(value);
}

function buildAuthPayload(user) {
  const token = jwt.sign(
    {
      id: user.id,
      role: user.role,
      clinicId: user.clinicId || null,
      email: user.email || user.phone || null
    },
    JWT_SECRET,
    { expiresIn: "1d" }
  );

  return {
    token,
    id: user.id,
    name: user.name,
    email: user.email || user.phone || null,
    role: user.role,
    clinicId: user.clinicId || null
  };
}

async function hasAdminAccount() {
  const adminsCount = await prisma.user.count({
    where: { role: "ADMIN" }
  });

  return adminsCount > 0;
}

async function hasAnyLocalUser() {
  const usersCount = await prisma.user.count();
  return usersCount > 0;
}

async function hasAnyLocalClinicalData() {
  const [patientsCount, appointmentsCount, visitsCount, billingCount] = await Promise.all([
    prisma.patient.count(),
    prisma.appointment.count(),
    prisma.visit.count(),
    prisma.billing.count()
  ]);

  return patientsCount + appointmentsCount + visitsCount + billingCount > 0;
}

function isClinicLinkConflict(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("already linked to another clinic");
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeGender(value) {
  const normalized = String(value || "").trim().toLowerCase();
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

function normalizeAppointmentStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["REQUESTED", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"].includes(normalized)) {
    return normalized;
  }

  return "REQUESTED";
}

function normalizeAppointmentSource(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["WHATSAPP", "FRONT_DESK", "PHONE", "WALK_IN"].includes(normalized)) {
    return normalized;
  }

  return "FRONT_DESK";
}

function parseSafeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

async function hydrateLocalFromRemotePatients(clinicId) {
  const normalizedClinicId = String(clinicId || "").trim();
  if (!normalizedClinicId || !isRemoteSyncConfigured()) {
    return {
      snapshots: 0,
      patientsUpserted: 0,
      appointmentsUpserted: 0
    };
  }

  const snapshots = await fetchRemotePatientsWithLatestAppointments({
    clinicId: normalizedClinicId
  });

  if (!snapshots.length) {
    return {
      snapshots: 0,
      patientsUpserted: 0,
      appointmentsUpserted: 0
    };
  }

  let patientsUpserted = 0;
  let appointmentsUpserted = 0;

  for (const snapshot of snapshots) {
    const normalizedPhone = normalizePhone(snapshot?.phone);
    if (!normalizedPhone) {
      continue;
    }

    const patientName = String(snapshot?.name || "").trim() || "Unknown Patient";
    const patientAge = Number.isInteger(snapshot?.age) ? snapshot.age : null;
    const patientGender = normalizeGender(snapshot?.gender);
    const patientAddress = String(snapshot?.address || "").trim() || null;
    const remotePatientId = String(snapshot?.patientId || "").trim() || null;

    let existingPatient = null;
    if (remotePatientId) {
      existingPatient = await prisma.patient.findUnique({
        where: { patientId: remotePatientId },
        select: { id: true }
      });
    }

    if (!existingPatient) {
      existingPatient = await prisma.patient.findFirst({
        where: {
          OR: [{ clinicId: normalizedClinicId }, { clinicId: null }],
          phone: normalizedPhone
        },
        select: { id: true }
      });
    }

    const localPatient = existingPatient
      ? await prisma.patient.update({
          where: { id: existingPatient.id },
          data: {
            clinicId: normalizedClinicId,
            name: patientName,
            phone: normalizedPhone,
            age: patientAge,
            gender: patientGender,
            address: patientAddress
          },
          select: { id: true }
        })
      : await prisma.patient.create({
          data: {
            patientId: remotePatientId || generatePatientId(),
            clinicId: normalizedClinicId,
            name: patientName,
            phone: normalizedPhone,
            age: patientAge,
            gender: patientGender,
            address: patientAddress
          },
          select: { id: true }
        });

    patientsUpserted += 1;

    const latestAppointment = snapshot?.latestAppointment || null;
    const appointmentId = String(latestAppointment?.appointmentId || "").trim();
    const scheduledAt = parseSafeDate(latestAppointment?.scheduledAt);
    if (!appointmentId || !scheduledAt) {
      continue;
    }

    await prisma.appointment.upsert({
      where: { appointmentId },
      update: {
        patientId: localPatient.id,
        doctorId: null,
        patientPhone: normalizedPhone,
        patientName,
        patientAge,
        patientGender,
        patientAddress,
        scheduledAt,
        status: normalizeAppointmentStatus(latestAppointment.status),
        source: normalizeAppointmentSource(latestAppointment.source),
        reason: String(latestAppointment.reason || "").trim() || null
      },
      create: {
        appointmentId,
        patientId: localPatient.id,
        doctorId: null,
        patientPhone: normalizedPhone,
        patientName,
        patientAge,
        patientGender,
        patientAddress,
        scheduledAt,
        status: normalizeAppointmentStatus(latestAppointment.status),
        source: normalizeAppointmentSource(latestAppointment.source),
        reason: String(latestAppointment.reason || "").trim() || null
      }
    });

    appointmentsUpserted += 1;
  }

  return {
    snapshots: snapshots.length,
    patientsUpserted,
    appointmentsUpserted
  };
}

async function performLoginCatchUp(clinicId) {
  if (!isRemoteSyncConfigured()) {
    return {
      catchUpResult: null,
      fallbackHydration: null
    };
  }

  const catchUpResult = await runSyncCyclesUntilCaughtUp({
    maxCycles: 80,
    waitMs: 250,
    maxSkipRetries: 80
  });

  if (catchUpResult.error) {
    return {
      catchUpResult,
      fallbackHydration: null,
      error:
        "Login succeeded, but initial clinic data sync from Supabase failed. Please retry.",
      details: catchUpResult.error,
      statusCode: 502
    };
  }

  if (catchUpResult.timedOut) {
    return {
      catchUpResult,
      fallbackHydration: null,
      error:
        "Login succeeded, but initial clinic data sync is taking too long. Please retry in a moment.",
      details: null,
      statusCode: 504
    };
  }

  const hasClinicalData = await hasAnyLocalClinicalData();
  if (hasClinicalData) {
    return {
      catchUpResult,
      fallbackHydration: null
    };
  }

  const normalizedClinicId = String(clinicId || "").trim();
  if (!normalizedClinicId) {
    return {
      catchUpResult,
      fallbackHydration: null
    };
  }

  try {
    const fallbackHydration = await hydrateLocalFromRemotePatients(normalizedClinicId);
    return {
      catchUpResult,
      fallbackHydration
    };
  } catch (fallbackError) {
    return {
      catchUpResult,
      fallbackHydration: null,
      error:
        "Login succeeded, but fallback clinic data hydration from Supabase failed. Please retry.",
      details: String(fallbackError?.message || fallbackError || "Fallback hydration failed"),
      statusCode: 502
    };
  }
}

router.get("/bootstrap-status", async (_req, res) => {
  try {
    const [adminExists, hasLocalUsers] = await Promise.all([
      hasAdminAccount(),
      hasAnyLocalUser()
    ]);

    return res.json({
      needsAdminSetup: !adminExists,
      hasLocalUsers,
      remoteLoginAvailable: isRemoteSyncConfigured()
    });
  } catch (error) {
    console.error("Bootstrap status error:", error);
    return res.status(500).json({ message: "Failed to check setup state" });
  }
});

router.post("/bootstrap-admin", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const name = String(req.body?.name || "System Admin").trim() || "System Admin";
  const clinicName = String(req.body?.clinicName || "").trim();

  if (!email || !password) {
    return res.status(400).json({ message: "Admin email and password are required" });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Please enter a valid admin email" });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  try {
    const adminExists = await hasAdminAccount();
    if (adminExists) {
      return res.status(409).json({ message: "Initial admin setup is already completed" });
    }

    const currentClinicContext = await getActiveClinicContext();
    const clinicId = currentClinicContext.clinicId || generateClinicId();
    const resolvedClinicName =
      clinicName ||
      currentClinicContext.clinicName ||
      `${name}'s Clinic`;

    await setActiveClinicContext({
      clinicId,
      clinicName: resolvedClinicName
    });

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await prisma.user.create({
      data: {
        name,
        phone: email,
        email,
        password: hashedPassword,
        role: "ADMIN",
        clinicId
      }
    });

    if (isRemoteSyncConfigured()) {
      try {
        await upsertRemoteClinic({
          clinicId,
          clinicName: resolvedClinicName
        });
        await upsertRemoteUser({
          clinicId,
          user: {
            name: admin.name,
            email: admin.email,
            phone: admin.phone,
            role: admin.role,
            password: admin.password
          },
          rawPassword: password
        });
      } catch (syncError) {
        await prisma.user
          .delete({ where: { id: admin.id } })
          .catch(() => null);

        return res.status(502).json({
          message:
            "Admin was not synced to Supabase. Setup was rolled back locally. Please check cloud sync settings and try again.",
          details: String(syncError?.message || syncError || "Supabase sync failed")
        });
      }

      try {
        await runSyncCycle();
      } catch (syncError) {
        console.warn("Admin bootstrap sync warning:", syncError?.message || syncError);
      }
    } else {
      console.warn(
        "Admin bootstrap sync warning: Supabase sync is disabled. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SYNC_ENABLED=true."
      );
    }

    return res.status(201).json(buildAuthPayload(admin));
  } catch (error) {
    if (isClinicLinkConflict(error)) {
      return res.status(409).json({ message: error.message });
    }

    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return res.status(409).json({ message: "Admin email already exists" });
    }

    console.error("Bootstrap admin creation error:", error);
    return res.status(500).json({ message: "Failed to create admin account" });
  }
});

/**
 * @route 
 * @desc    
 */
router.post("/login", async (req, res) => {
  const inputIdentifier = req.body?.email || req.body?.phone;
  const email = normalizeEmail(inputIdentifier);
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ message: "Email or phone and password are required" });
  }

  console.log("LOGIN ATTEMPT - email:", email, "password:", password, "password length:", password.length);

  const isPhone = /^\+?\d{7,15}$/.test(email);
  if (!isValidEmail(email) && !isPhone) {
    return res.status(400).json({ message: "Please enter a valid email or phone number" });
  }

  try {
    const localUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone: email }]
      }
    });

    console.log("LOGIN FIND - localUser found:", !!localUser, "placeholder check:", localUser ? localUser.password !== "SYNC_PLACEHOLDER" : false);
    if (localUser && localUser.password !== "SYNC_PLACEHOLDER") {
      const isPasswordValid = await bcrypt.compare(password, localUser.password);
      console.log("LOGIN PASSWORD COMPARE - valid:", isPasswordValid);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!localUser.email && isValidEmail(localUser.phone)) {
        const normalizedLocalEmail = normalizeEmail(localUser.phone);
        const updatedLocalUser = await prisma.user.update({
          where: { id: localUser.id },
          data: { email: normalizedLocalEmail }
        });
        localUser.email = updatedLocalUser.email;
      }

      if (localUser.clinicId) {
        await setActiveClinicContext({ clinicId: localUser.clinicId });
      }

      const activeClinicContext = await getActiveClinicContext();
      const localClinicId = String(localUser.clinicId || activeClinicContext?.clinicId || "").trim() || null;
      const loginCatchUp = await performLoginCatchUp(localClinicId);

      if (loginCatchUp?.error) {
        return res.status(loginCatchUp.statusCode || 502).json({
          message: loginCatchUp.error,
          details: loginCatchUp.details || undefined
        });
      }

      if (loginCatchUp?.catchUpResult) {
        return res.json({
          ...buildAuthPayload(localUser),
          initialSync: {
            cycles: loginCatchUp.catchUpResult.cycles,
            pulledRecords: loginCatchUp.catchUpResult.totalPulled,
            pushedRecords: loginCatchUp.catchUpResult.totalPushed,
            fallbackHydration: loginCatchUp.fallbackHydration
          }
        });
      }

      return res.json(buildAuthPayload(localUser));
    }

    const remoteMatch = await findRemoteUserMatch({
      email,
      password
    });

    if (remoteMatch) {
      await setActiveClinicContext({ clinicId: remoteMatch.clinicId });

      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { phone: remoteMatch.user.phone }]
        },
        select: { id: true }
      });

      const syncedData = {
        name: remoteMatch.user.name,
        email: remoteMatch.user.email || email,
        phone: remoteMatch.user.phone,
        password: remoteMatch.user.password,
        role: remoteMatch.user.role,
        clinicId: remoteMatch.clinicId
      };

      const syncedUser = existing
        ? await prisma.user.update({
            where: { id: existing.id },
            data: syncedData
          })
        : await prisma.user.create({
            data: syncedData
          });

      const loginCatchUp = await performLoginCatchUp(remoteMatch.clinicId);
      if (loginCatchUp?.error) {
        return res.status(loginCatchUp.statusCode || 502).json({
          message: loginCatchUp.error,
          details: loginCatchUp.details || undefined
        });
      }

      return res.json({
        ...buildAuthPayload(syncedUser),
        initialSync: {
          cycles: loginCatchUp.catchUpResult?.cycles || 0,
          pulledRecords: loginCatchUp.catchUpResult?.totalPulled || 0,
          pushedRecords: loginCatchUp.catchUpResult?.totalPushed || 0,
          fallbackHydration: loginCatchUp.fallbackHydration
        }
      });
    }

    const hasLocalUsers = await hasAnyLocalUser();
    if (!hasLocalUsers) {
      return res.status(409).json({
        message:
          "No local users found. Create an admin account or login with a synced user when cloud sync is configured."
      });
    }

    return res.status(401).json({ message: "Invalid email or password" });

  } catch (error) {
    if (isClinicLinkConflict(error)) {
      return res.status(409).json({ message: error.message });
    }

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
      const decoded = jwt.verify(token, JWT_SECRET);
      
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