/**
 * Test setup: configures a separate test database using Prisma
 * Seeds test data before all tests, cleans up after
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { JWT_SECRET } = require("../config/jwt");

const prisma = new PrismaClient();
const SECRET = JWT_SECRET;

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
        update: {
            password: hashedPassword,
            name: "Test Doctor",
            role: "DOCTOR",
        },
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
        update: {
            password: hashedPassword,
            name: "Test Receptionist",
            role: "RECEPTIONIST",
        },
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
    // 1. Delete Billings associated with test visits or test patients
    try {
        await prisma.billing.deleteMany({
            where: {
                OR: [
                    {
                        visit: {
                            visitId: { startsWith: "VIS-" }
                        }
                    },
                    {
                        visit: {
                            patient: {
                                OR: [
                                    { patientId: { startsWith: "PAT_TEST_" } },
                                    { patientId: { startsWith: "PAT-" } }
                                ]
                            }
                        }
                    }
                ]
            }
        });
    } catch (e) {
        // Best effort
    }

    // 2. Delete Appointments associated with test patients or test doctors/users, or test visits
    try {
        await prisma.appointment.deleteMany({
            where: {
                OR: [
                    {
                        patient: {
                            OR: [
                                { patientId: { startsWith: "PAT_TEST_" } },
                                { patientId: { startsWith: "PAT-" } }
                            ]
                        }
                    },
                    {
                        doctor: {
                            phone: { startsWith: "99999" }
                        }
                    },
                    {
                        linkedVisitId: { startsWith: "VIS-" }
                    }
                ]
            }
        });
    } catch (e) {
        // Best effort
    }

    // 3. Delete Visits associated with test patients or test doctors/users, or starting with VIS-TEST-
    try {
        await prisma.visit.deleteMany({
            where: {
                OR: [
                    { visitId: { startsWith: "VIS-" } },
                    {
                        patient: {
                            OR: [
                                { patientId: { startsWith: "PAT_TEST_" } },
                                { patientId: { startsWith: "PAT-" } }
                            ]
                        }
                    },
                    {
                        doctor: {
                            phone: { startsWith: "99999" }
                        }
                    }
                ]
            }
        });
    } catch (e) {
        // Best effort
    }

    // 4. Delete test Patients
    try {
        await prisma.patient.deleteMany({
            where: {
                OR: [
                    { patientId: { startsWith: "PAT_TEST_" } },
                    { patientId: { startsWith: "PAT-" } }
                ]
            }
        });
    } catch (e) {
        // Best effort
    }

    // 5. Delete test Users
    try {
        await prisma.user.deleteMany({
            where: {
                phone: { startsWith: "99999" }
            }
        });
    } catch (e) {
        // Best effort
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
