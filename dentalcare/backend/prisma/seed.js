const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();

async function main() {
    const password = await bcrypt.hash("123456", 10);

    const adminData = [
        { name: "System Admin", phone: "9000000000", role: "ADMIN" }
    ];

    const receptionistsData = [
        { name: "Front Desk", phone: "9000000010", role: "RECEPTIONIST" }
    ];

    const doctorsData = [
        { name: "Prasad Mahankal", phone: "9000000001", role: "DOCTOR" },
        { name: "Abhibhoo Anand", phone: "9000000002", role: "DOCTOR" },
        { name: "Debjyoti Mukhopadhyay", phone: "9000000003", role: "DOCTOR" },
        { name: "Madhur Patil", phone: "9000000004", role: "DOCTOR" }
    ];

    const usersData = [...adminData, ...receptionistsData, ...doctorsData];

    console.log("Seeding users...");
    for (const staff of usersData) {
        await prisma.user.upsert({
            where: { phone: staff.phone },
            update: {
                name: staff.name,
                role: staff.role
            },
            create: {
                name: staff.name,
                phone: staff.phone,
                password: password,
                role: staff.role
            }
        });
    }

    console.log("Seeding patients...");
    const patientsData = [
        { patientId: "PAT001", name: "Rahul Sharma", phone: "9876543210", gender: "Male", age: 28 },
        { patientId: "PAT002", name: "Sneha Patil", phone: "9876543211", gender: "Female", age: 24 },
        { patientId: "PAT003", name: "Amit Verma", phone: "9876543212", gender: "Male", age: 35 },
        { patientId: "PAT004", name: "Priya Das", phone: "9876543213", gender: "Female", age: 30 },
        { patientId: "PAT005", name: "Kiran G.", phone: "9876543214", gender: "Male", age: 42 }
    ];

    for (const p of patientsData) {
        await prisma.patient.upsert({
            where: { patientId: p.patientId },
            update: { name: p.name },
            create: { ...p, address: "Seeded Dummy Address" }
        });
    }

    const doctorsInDb = await prisma.user.findMany({ where: { role: 'DOCTOR' } });
    const patientsInDb = await prisma.patient.findMany();

    console.log("Seeding visits...");
    const procedures = [
        "Root Canal Therapy",
        "Dental Filling",
        "Wisdom Tooth Extraction",
        "Teeth Scaling",
        "Braces Adjustment"
    ];

    for (let i = 0; i < 10; i++) {
        const visitId = `VISIT_SEED_${i + 1}`;
        await prisma.visit.upsert({
            where: { visitId: visitId },
            update: {},
            create: {
                visitId: visitId,
                patientId: patientsInDb[i % patientsInDb.length].id,
                doctorId: doctorsInDb[i % doctorsInDb.length].id,
                visitType: i % 3 === 0 ? "FOLLOW_UP" : "NEW",
                caseOutcome: i % 4 === 0 ? "COMPLETED" : "ONGOING",
                procedures: procedures[i % procedures.length],
                clinicalStatus: i % 4 === 0 ? "CLINICALLY_COMPLETED" : "IN_PROGRESS",
                paymentStatus: i % 2 === 0 ? "PAID" : "NOT_BILLED"
            }
        });

        if (i % 2 === 0) {
            const amount = (i + 1) * 500;
            const visit = await prisma.visit.findUnique({ where: { visitId } });
            await prisma.billing.upsert({
                where: { visitId: visit.id },
                update: {},
                create: {
                    billId: `BILL_SEED_${i + 1}`,
                    visitId: visit.id,
                    currentCharges: amount,
                    totalAmount: amount,
                    paidAmount: amount,
                    pendingAmount: 0,
                    updatedPending: 0
                }
            });
        }
    }

    console.log(`Seeded ${usersData.length} users, ${patientsInDb.length} patients, and 10 visits.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
