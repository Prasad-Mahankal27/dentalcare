const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({ where: { role: 'DOCTOR' } });
    const patients = await prisma.patient.count();
    const visits = await prisma.visit.count();

    console.log("Doctors In DB:", users.map(u => u.name));
    console.log("Patients Count:", patients);
    console.log("Visits Count:", visits);
}

main().finally(() => prisma.$disconnect());
