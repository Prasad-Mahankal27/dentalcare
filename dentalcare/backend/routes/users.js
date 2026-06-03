const express = require("express");
const bcrypt = require("bcrypt");
const { authMiddleware } = require("../auth");
const { prisma } = require("../db/prisma");
const { getActiveClinicContext, runSyncCycle } = require("../sync/engine");
const {
  isRemoteSyncConfigured,
  upsertRemoteUser,
  deleteRemoteUser
} = require("../sync/remoteAuth");
const {
  SubscriptionLimitError,
  SubscriptionServiceUnavailableError,
  assertCanAssignRoleForClinic,
  resolveClinicIdForUser
} = require("../subscription/service");

const router = express.Router();

const ALLOWED_ROLES = new Set(["ADMIN", "DOCTOR", "RECEPTIONIST"]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /.+@.+\..+/.test(value);
}

function normalizeRole(rawRole) {
  return String(rawRole || "")
    .trim()
    .toUpperCase();
}

router.get("/", authMiddleware(["ADMIN"]), async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json(users);
  } catch (error) {
    console.error("List users error:", error);
    return res.status(500).json({ message: "Failed to load users" });
  }
});

router.get("/summary", authMiddleware(["ADMIN"]), async (_req, res) => {
  try {
    const [totalUsers, totalDoctors, totalReceptionists, totalAdmins] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "DOCTOR" } }),
      prisma.user.count({ where: { role: "RECEPTIONIST" } }),
      prisma.user.count({ where: { role: "ADMIN" } })
    ]);

    return res.json({
      totalUsers,
      totalDoctors,
      totalReceptionists,
      totalAdmins
    });
  } catch (error) {
    console.error("Users summary error:", error);
    return res.status(500).json({ message: "Failed to load summary" });
  }
});

router.post("/", authMiddleware(["ADMIN"]), async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const role = normalizeRole(req.body?.role);
    const requesterId = Number(req.user?.id);

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password and role are required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    if (!ALLOWED_ROLES.has(role)) {
      return res.status(400).json({ message: "Invalid role provided" });
    }

    const requester = Number.isInteger(requesterId)
      ? await prisma.user.findUnique({
          where: { id: requesterId },
          select: { clinicId: true }
        })
      : null;

    const activeClinicContext = await getActiveClinicContext();
    const clinicId = String(requester?.clinicId || activeClinicContext.clinicId || "").trim();

    if (!clinicId) {
      return res.status(409).json({
        message: "Clinic setup is incomplete. Please complete admin setup before creating users."
      });
    }

    await assertCanAssignRoleForClinic(clinicId, role);

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone: email,
        password: hashedPassword,
        role,
        clinicId
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true
      }
    });

    let syncWarning = null;

    if (isRemoteSyncConfigured()) {
      try {
        await upsertRemoteUser({
          clinicId,
          user: {
            name,
            email,
            phone: email,
            role,
            password: hashedPassword
          },
          rawPassword: password
        });
      } catch (syncError) {
        syncWarning = String(syncError?.message || syncError || "Supabase sync failed");
        console.warn("Create user remote sync warning:", syncWarning);
      }

      try {
        await runSyncCycle();
      } catch (syncError) {
        console.warn("Create user sync warning:", syncError?.message || syncError);
        if (!syncWarning) {
          syncWarning = String(syncError?.message || syncError || "Supabase sync failed");
        }
      }
    }

    if (syncWarning) {
      return res.status(201).json({
        message: "User created locally. Supabase sync is pending.",
        user,
        syncPending: true,
        syncWarning
      });
    }

    return res.status(201).json({
      message: "User created successfully",
      user
    });
  } catch (error) {
    if (error instanceof SubscriptionServiceUnavailableError) {
      return res.status(error.statusCode).json(error.payload);
    }

    if (error instanceof SubscriptionLimitError) {
      return res.status(error.statusCode).json(error.payload);
    }

    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return res.status(409).json({ message: "Email already exists" });
    }

    console.error("Create user error:", error);
    return res.status(500).json({ message: "Failed to create user" });
  }
});

router.patch("/:userId/role", authMiddleware(["ADMIN"]), async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const role = normalizeRole(req.body?.role);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    if (!ALLOWED_ROLES.has(role)) {
      return res.status(400).json({ message: "Invalid role provided" });
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, clinicId: true }
    });

    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    if (role !== existing.role) {
      const fallbackClinicId = await resolveClinicIdForUser(req.user || {});
      const clinicId = String(existing.clinicId || fallbackClinicId || "").trim();
      await assertCanAssignRoleForClinic(clinicId, role, { excludeUserId: userId });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        clinicId: true,
        password: true,
        createdAt: true
      }
    });

    if (isRemoteSyncConfigured()) {
      try {
        await upsertRemoteUser({
          clinicId: updated.clinicId,
          user: {
            name: updated.name,
            email: updated.email,
            phone: updated.phone,
            role: updated.role,
            password: updated.password
          }
        });
      } catch (syncError) {
        await prisma.user
          .update({ where: { id: userId }, data: { role: existing.role } })
          .catch(() => null);

        return res.status(502).json({
          message: "Role sync to Supabase failed. Local role change was rolled back.",
          details: String(syncError?.message || syncError || "Supabase sync failed")
        });
      }
    }

    return res.json({
      message: "Role updated",
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        createdAt: updated.createdAt
      }
    });
  } catch (error) {
    if (error instanceof SubscriptionServiceUnavailableError) {
      return res.status(error.statusCode).json(error.payload);
    }

    if (error instanceof SubscriptionLimitError) {
      return res.status(error.statusCode).json(error.payload);
    }

    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return res.status(404).json({ message: "User not found" });
    }

    console.error("Update role error:", error);
    return res.status(500).json({ message: "Failed to update role" });
  }
});

router.delete("/:userId", authMiddleware(["ADMIN"]), async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const requesterId = Number(req.user?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    if (Number.isInteger(requesterId) && requesterId === userId) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true
      }
    });

    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    if (existing.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return res.status(409).json({ message: "At least one admin account must remain" });
      }
    }

    const linkedVisitsCount = await prisma.visit.count({
      where: { doctorId: userId }
    });

    if (linkedVisitsCount > 0) {
      return res.status(409).json({
        message:
          "This user has linked visits and cannot be deleted. Reassign or remove those visits first."
      });
    }

    const deleted = await prisma.user.delete({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true
      }
    });

    let syncWarning = null;

    if (isRemoteSyncConfigured()) {
      try {
        await deleteRemoteUser({
          email: existing.email,
          phone: existing.phone
        });
      } catch (syncError) {
        syncWarning = String(syncError?.message || syncError || "Supabase sync failed");
        console.warn("Delete user remote sync warning:", syncWarning);
      }
    }

    if (isRemoteSyncConfigured()) {
      try {
        await runSyncCycle();
      } catch (syncError) {
        console.warn("Delete user sync warning:", syncError?.message || syncError);
        if (!syncWarning) {
          syncWarning = String(syncError?.message || syncError || "Supabase sync failed");
        }
      }
    }

    if (syncWarning) {
      return res.json({
        message: "User deleted locally. Supabase sync is pending and will retry automatically.",
        user: deleted,
        syncPending: true,
        syncWarning
      });
    }

    return res.json({
      message: "User deleted successfully",
      user: deleted
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return res.status(404).json({ message: "User not found" });
    }

    if (error && typeof error === "object" && "code" in error && error.code === "P2003") {
      return res.status(409).json({
        message:
          "User cannot be deleted due to linked records. Reassign or remove dependent data first."
      });
    }

    console.error("Delete user error:", error);
    return res.status(500).json({ message: "Failed to delete user" });
  }
});

module.exports = router;
