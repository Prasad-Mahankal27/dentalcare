const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function debugCharts() {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        console.log("Current Time:", new Date().toISOString());
        console.log("Filtering from (sevenDaysAgo):", sevenDaysAgo.toISOString());

        const last7DaysVisits = await prisma.visit.findMany({
            where: { createdAt: { gte: sevenDaysAgo } },
            select: { createdAt: true, visitType: true, procedures: true, diagnosis: true }
        });

        const last7DaysPatients = await prisma.patient.findMany({
            where: { createdAt: { gte: sevenDaysAgo } },
            select: { createdAt: true }
        });

        console.log("Total visits in last 7 days:", last7DaysVisits.length);
        console.log("Total patients in last 7 days:", last7DaysPatients.length);

        if (last7DaysVisits.length > 0) {
            console.log("Sample visit createdAt:", last7DaysVisits[0].createdAt.toISOString());
            console.log("Sample visit procedures:", last7DaysVisits[0].procedures);
        }

        const days = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(sevenDaysAgo);
            date.setDate(date.getDate() + i);
            days.push({
                dateObj: date,
                label: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
            });
        }

        console.log("Days generated:", days.map(d => d.label));

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
                range: `${start.toISOString()} to ${end.toISOString()}`,
                newPatients,
                recurringPatients
            };
        });

        console.log("--- Patient Survey Debug ---");
        console.table(patientSurveyData);

        const dentalIssuesData = days.map(day => {
            const start = new Date(day.dateObj);
            const end = new Date(day.dateObj);
            end.setHours(23, 59, 59, 999);

            const dailyVisits = last7DaysVisits.filter(v => v.createdAt >= start && v.createdAt <= end);

            const countIssue = (keywords) => dailyVisits.filter(v => {
                const text = `${v.procedures || ""} ${v.diagnosis || ""}`.toLowerCase();
                const matched = keywords.some(k => text.includes(k));
                if (matched) {
                    // console.log(`Matched ${keywords[0]} on text: "${text}"`);
                }
                return matched;
            }).length;

            return {
                date: day.label,
                cavities: countIssue(["cavity", "filling", "caries"]),
                gumDisease: countIssue(["gum", "gingiv", "periodon", "scaling"]),
                rootCanals: countIssue(["root canal", "rct", "endodontic"])
            };
        });

        console.log("--- Dental Issues Debug ---");
        console.table(dentalIssuesData);

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

debugCharts();
