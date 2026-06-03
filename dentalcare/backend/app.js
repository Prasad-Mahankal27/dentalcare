const { loadEnv } = require("./config/loadEnv");
loadEnv();
const express = require("express");
const cors = require("cors");
const { authMiddleware } = require("./auth");
const { prisma } = require("./db/prisma");
const {
    getSyncStatus,
    runSyncCycle,
    enqueueFullBootstrapSync
} = require("./sync/engine");

const app = express();
const authRoutes = require("./routes/auth");
const patientRoutes = require("./routes/patient");
const visitRoutes = require("./routes/visit");
const billingRoutes = require("./routes/billing");
const dashboardRoutes = require("./routes/dashboard");
const appointmentRoutes = require("./routes/appointments");
const usersRoutes = require("./routes/users");
const subscriptionRoutes = require("./routes/subscription");

app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/patients", patientRoutes);
app.use("/visits", visitRoutes);
app.use("/billing", billingRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/appointments", appointmentRoutes);
app.use("/users", usersRoutes);
app.use("/subscription", subscriptionRoutes);

app.get("/health", (req, res) => {
    res.json({ status: "OK" });
});

app.get("/sync/indicator", authMiddleware(), async (_req, res) => {
    const [pendingOutbox] = await Promise.all([
        prisma.syncOutbox.count()
    ]);

    const syncStatus = getSyncStatus();

    res.json({
        enabled: syncStatus.enabled,
        hasClinicContext: syncStatus.hasClinicContext,
        inProgress: syncStatus.inProgress,
        lastSyncAt: syncStatus.lastSyncAt,
        lastSyncError: syncStatus.lastSyncError,
        lastPullCount: syncStatus.lastPullCount,
        lastPushCount: syncStatus.lastPushCount,
        pendingOutbox
    });
});

app.get("/sync/status", authMiddleware(["ADMIN"]), async (_req, res) => {
    const [pendingOutbox] = await Promise.all([
        prisma.syncOutbox.count()
    ]);

    res.json({
        ...getSyncStatus(),
        pendingOutbox
    });
});

app.post("/sync/run", authMiddleware(["ADMIN"]), async (_req, res) => {
    await runSyncCycle();

    const pendingOutbox = await prisma.syncOutbox.count();
    res.json({
        ...getSyncStatus(),
        pendingOutbox
    });
});

app.post("/sync/bootstrap", authMiddleware(["ADMIN"]), async (_req, res) => {
    const queued = await enqueueFullBootstrapSync();
    await runSyncCycle();

    const pendingOutbox = await prisma.syncOutbox.count();
    res.json({
        queued,
        ...getSyncStatus(),
        pendingOutbox
    });
});

module.exports = app;
