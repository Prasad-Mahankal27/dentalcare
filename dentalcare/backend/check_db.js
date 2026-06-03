const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    const visits = await prisma.visit.count();
    const patients = await prisma.patient.count();
    const earnings = await prisma.billing.aggregate({
        _sum: { paidAmount: true }
    });
    const doctors = await prisma.user.count({ where: { role: 'DOCTOR' } });

    console.log("--- DB STATS ---");
    console.log("Total Visits:", visits);
    console.log("Total Patients:", patients);
    console.log("Total Earnings:", earnings._sum.paidAmount || 0);
    console.log("Total Doctors:", doctors);

    const recent = await prisma.visit.findMany({
        take: 2,
        orderBy: { createdAt: 'desc' },
        include: { patient: true }
    });
    console.log("Recent Visits:", JSON.stringify(recent, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
