const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    try {
        const count = await prisma.visit.count();
        const latest = await prisma.visit.findFirst({ orderBy: { createdAt: 'desc' } });
        const allPatients = await prisma.patient.count();

        console.log("Total Visits:", count);
        console.log("Total Patients:", allPatients);
        console.log("Latest Visit createdAt:", latest ? latest.createdAt.toISOString() : 'None');
        console.log("Current Server Time:", new Date().toISOString());

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        console.log("Filter threshold (sevenDaysAgo local midnight):", sevenDaysAgo.toISOString());

        const recentCount = await prisma.visit.count({
            where: { createdAt: { gte: sevenDaysAgo } }
        });
        console.log("Visits >= threshold:", recentCount);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
