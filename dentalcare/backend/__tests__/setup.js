/**
 * Test setup: configures a separate test database using Prisma
 * Seeds test data before all tests, cleans up after
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const prisma = new PrismaClient();
const SECRET = "dentalcare_secret";

/**
 * Generate a valid JWT token for testing
 */
function generateTestToken(userId, role = "DOCTOR") {
    return jwt.sign({ id: userId, role }, SECRET, { expiresIn: "1d" });
}

/**
 * Seed minimal test data and return references
 */
async function seedTestData() {
    // Create a doctor user
    const hashedPassword = await bcrypt.hash("password123", 10);
    const doctor = await prisma.user.upsert({
        where: { phone: "9999900001" },
        update: {},
        create: {
            name: "Test Doctor",
            phone: "9999900001",
            password: hashedPassword,
            role: "DOCTOR",
        },
    });

    // Create a receptionist user
    const receptionist = await prisma.user.upsert({
        where: { phone: "9999900002" },
        update: {},
        create: {
            name: "Test Receptionist",
            phone: "9999900002",
            password: hashedPassword,
            role: "RECEPTIONIST",
        },
    });

    // Create a test patient
    const patient = await prisma.patient.upsert({
        where: { patientId: "PAT_TEST_001" },
        update: {},
        create: {
            patientId: "PAT_TEST_001",
            name: "Test Patient",
            phone: "8888800001",
            age: 30,
            gender: "Male",
            address: "Test Address",
        },
    });

    return { doctor, receptionist, patient };
}

/**
 * Clean up test-created data (best-effort, ignore errors)
 */
async function cleanupTestData() {
    try {
        // Delete test billings first (FK constraint)
        await prisma.billing.deleteMany({
            where: {
                visit: {
                    visitId: { startsWith: "VIS-TEST-" },
                },
            },
        });
        // Delete test visits
        await prisma.visit.deleteMany({
            where: { visitId: { startsWith: "VIS-TEST-" } },
        });
        // Delete test patients
        await prisma.patient.deleteMany({
            where: { patientId: { startsWith: "PAT_TEST_" } },
        });
        // Delete test users
        await prisma.user.deleteMany({
            where: { phone: { startsWith: "99999" } },
        });
    } catch (e) {
        // Best effort cleanup
    }
}

async function disconnectPrisma() {
    await prisma.$disconnect();
}

module.exports = {
    prisma,
    generateTestToken,
    seedTestData,
    cleanupTestData,
    disconnectPrisma,
    SECRET,
};
