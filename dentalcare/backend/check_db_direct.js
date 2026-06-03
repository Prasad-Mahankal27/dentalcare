const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const prisma = new PrismaClient();

async function main() {
    let output = "";
    try {
        const u = await prisma.user.count({ where: { role: 'DOCTOR' } });
        const p = await prisma.patient.count();
        const v = await prisma.visit.count();
        const users = await prisma.user.findMany({
            where: { role: 'DOCTOR' },
            select: { name: true, phone: true }
        });

        output += "DATABASE CHECK RESULT:\n";
        output += JSON.stringify({ doctors: u, patients: p, visits: v }, null, 2) + "\n";
        output += "DOCTOR LIST:\n" + JSON.stringify(users, null, 2) + "\n";
    } catch (e) {
        output += "DB CHECK ERROR: " + e.message + "\n" + e.stack + "\n";
    } finally {
        fs.writeFileSync("db_check_direct.txt", output);
        await prisma.$disconnect();
        process.exit(0);
    }
}

main();
