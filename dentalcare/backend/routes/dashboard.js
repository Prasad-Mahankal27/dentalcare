const express = require("express");
const router = express.Router();
const { authMiddleware } = require("./auth");
const { prisma } = require("../db/prisma");

function toLocalDateKey(dateValue) {
    const date = new Date(dateValue);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function incrementCount(map, key, amount = 1) {
    map.set(key, (map.get(key) || 0) + amount);
}

router.get("/stats", authMiddleware(["ADMIN", "DOCTOR", "RECEPTIONIST"]), async (req, res) => {
    try {
        const totalVisits = await prisma.visit.count();
        const completedVisits = await prisma.visit.count({
            where: { caseOutcome: "COMPLETED" }
        });
        const newPatientsCount = await prisma.patient.count();
        const earningsAggr = await prisma.billing.aggregate({
            _sum: { paidAmount: true }
        });
        const totalEarnings = earningsAggr._sum.paidAmount || 0;

        const recentAppointments = await prisma.visit.findMany({
            include: {
                patient: { select: { name: true } },
                doctor: { select: { name: true } }
            },
            orderBy: { createdAt: "desc" },
            take: 5
        });

        const doctorsList = await prisma.user.findMany({
            where: { role: "DOCTOR" },
            select: { id: true, name: true, createdAt: true }
        });

        const trendDays = 7;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const windowStart = new Date(startOfToday);
        windowStart.setDate(windowStart.getDate() - (trendDays - 1));

        const days = [];
        for (let i = 0; i < trendDays; i++) {
            const dayDate = new Date(windowStart);
            dayDate.setDate(windowStart.getDate() + i);

            days.push({
                dateKey: toLocalDateKey(dayDate),
                label: dayDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
            });
        }

        const last7DaysVisits = await prisma.visit.findMany({
            where: { createdAt: { gte: windowStart } },
            select: {
                createdAt: true,
                visitType: true,
                procedures: true,
                diagnosis: true,
                caseOutcome: true
            }
        });

        const last7DaysPatients = await prisma.patient.findMany({
            where: { createdAt: { gte: windowStart } },
            select: { createdAt: true }
        });

        const last7DaysBilling = await prisma.billing.findMany({
            where: { createdAt: { gte: windowStart } },
            select: { createdAt: true, paidAmount: true }
        });

        const appointmentsByDay = new Map();
        const operationsByDay = new Map();
        const recurringByDay = new Map();

        // Dynamic dental issue tracking: category -> Map<dayKey, count>
        const issuesByCategory = new Map();
        const allCategories = new Set();

        function parseDiagnosisCategories(text) {
            if (!text) return [];
            return text
                .split(/[,;]+/)
                .map(s => s.trim())
                .filter(Boolean)
                .map(s => s.charAt(0).toUpperCase() + s.slice(1)); // Title-case
        }

        for (const visit of last7DaysVisits) {
            const dayKey = toLocalDateKey(visit.createdAt);
            incrementCount(appointmentsByDay, dayKey);

            if (visit.caseOutcome === "COMPLETED") {
                incrementCount(operationsByDay, dayKey);
            }

            if (visit.visitType === "FOLLOW_UP") {
                incrementCount(recurringByDay, dayKey);
            }

            // Extract categories from both diagnosis and procedures fields
            const categories = [
                ...parseDiagnosisCategories(visit.diagnosis),
                ...parseDiagnosisCategories(visit.procedures)
            ];

            const seen = new Set(); // avoid double-counting same category on one visit
            for (const cat of categories) {
                if (seen.has(cat)) continue;
                seen.add(cat);
                allCategories.add(cat);

                if (!issuesByCategory.has(cat)) {
                    issuesByCategory.set(cat, new Map());
                }
                incrementCount(issuesByCategory.get(cat), dayKey);
            }
        }

        const patientsByDay = new Map();
        for (const patient of last7DaysPatients) {
            incrementCount(patientsByDay, toLocalDateKey(patient.createdAt));
        }

        const earningsByDay = new Map();
        for (const billing of last7DaysBilling) {
            incrementCount(earningsByDay, toLocalDateKey(billing.createdAt), Number(billing.paidAmount || 0));
        }

        const appointmentTrend = days.map((day) => appointmentsByDay.get(day.dateKey) || 0);
        const operationTrend = days.map((day) => operationsByDay.get(day.dateKey) || 0);
        const patientTrend = days.map((day) => patientsByDay.get(day.dateKey) || 0);
        const earningsTrend = days.map((day) => Number((earningsByDay.get(day.dateKey) || 0).toFixed(2)));

        const patientSurveyData = days.map((day) => ({
            date: day.label,
            newPatients: patientsByDay.get(day.dateKey) || 0,
            recurringPatients: recurringByDay.get(day.dateKey) || 0
        }));

        const dentalIssueCategories = [...allCategories].sort();

        const dentalIssuesData = days.map((day) => {
            const entry = { date: day.label };
            for (const cat of dentalIssueCategories) {
                const catMap = issuesByCategory.get(cat);
                entry[cat] = catMap ? (catMap.get(day.dateKey) || 0) : 0;
            }
            return entry;
        });

        res.json({
            appointments: totalVisits,
            operations: completedVisits,
            newPatients: newPatientsCount,
            earnings: totalEarnings.toLocaleString("en-IN"),
            appointmentTrend,
            operationTrend,
            patientTrend,
            earningsTrend,
            recentAppointments,
            doctorsList,
            patientSurveyData,
            dentalIssueCategories,
            dentalIssuesData
        });
    } catch (err) {
        console.error("Dashboard stats error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
