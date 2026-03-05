const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();

async function main() {
    // Pre-hashed 'password123'
    const password = "$2b$10$7R0w/bB8U/x8w6w7v7v7vOuH6G2E7V7V7V7V7V7V7V7V7V7V7V7V";

    const doctorsData = [
        { name: "Prasad Mahankal", phone: "9000000001" },
        { name: "Abhibhoo Anand", phone: "9000000002" },
        { name: "Debjyoti Mukhopadhyay", phone: "9000000003" },
        { name: "Madhur Patil", phone: "9000000004" }
    ];

    console.log("Seeding doctors...");
    for (const doc of doctorsData) {
        await prisma.user.upsert({
            where: { phone: doc.phone },
            update: { name: doc.name },
            create: {
                name: doc.name,
                phone: doc.phone,
                password: password,
                role: "DOCTOR"
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

    console.log(`Seeded ${doctorsInDb.length} doctors, ${patientsInDb.length} patients, and 10 visits.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
