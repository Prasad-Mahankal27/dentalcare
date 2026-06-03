const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
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

        console.log("Total Visits:", totalVisits);
        console.log("Completed Visits:", completedVisits);
        console.log("Total Patients:", newPatientsCount);
        console.log("Total Earnings:", totalEarnings);

        // Calculate Last 7 Days Statistics
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const last7DaysVisits = await prisma.visit.findMany({
            where: { createdAt: { gte: sevenDaysAgo } },
            select: { createdAt: true, visitType: true, procedures: true, diagnosis: true }
        });

        const last7DaysPatients = await prisma.patient.findMany({
            where: { createdAt: { gte: sevenDaysAgo } },
            select: { createdAt: true }
        });

        const days = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(sevenDaysAgo);
            date.setDate(date.getDate() + i);
            days.push({
                dateObj: date,
                label: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
            });
        }

        const patientSurveyData = days.map(day => {
            const start = new Date(day.dateObj);
            const end = new Date(day.dateObj);
            end.setHours(23, 59, 59, 999);

            const newPatients = last7DaysPatients.filter(p => p.createdAt >= start && p.createdAt <= end).length;
            const recurringPatients = last7DaysVisits.filter(v =>
                v.createdAt >= start && v.createdAt <= end && v.visitType === "FOLLOW_UP"
            ).length;

            return {
                date: day.label,
                newPatients,
                recurringPatients
            };
        });

        console.log("--- Patient Survey Data ---");
        console.table(patientSurveyData);

        const dentalIssuesData = days.map(day => {
            const start = new Date(day.dateObj);
            const end = new Date(day.dateObj);
            end.setHours(23, 59, 59, 999);

            const dailyVisits = last7DaysVisits.filter(v => v.createdAt >= start && v.createdAt <= end);

            const countIssue = (keywords) => dailyVisits.filter(v => {
                const text = `${v.procedures || ""} ${v.diagnosis || ""}`.toLowerCase();
                return keywords.some(k => text.includes(k));
            }).length;

            return {
                date: day.label,
                cavities: countIssue(["cavity", "filling", "caries"]),
                gumDisease: countIssue(["gum", "gingiv", "periodon", "scaling"]),
                rootCanals: countIssue(["root canal", "rct", "endodontic"])
            };
        });

        console.log("--- Dental Issues Data ---");
        console.table(dentalIssuesData);

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
