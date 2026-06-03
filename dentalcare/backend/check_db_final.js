const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    try {
        const u = await prisma.user.count({ where: { role: 'DOCTOR' } });
        const p = await prisma.patient.count();
        const v = await prisma.visit.count();
        const users = await prisma.user.findMany({ select: { name: true, phone: true } });

        console.log("DATABASE CHECK RESULT:");
        console.log({ doctors: u, patients: p, visits: v });
        console.log("USER LIST:", users);
    } catch (e) {
        console.error("DB CHECK ERROR:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
