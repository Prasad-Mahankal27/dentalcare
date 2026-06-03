/**
 * Visit API tests
 */
jest.mock("nodemailer", () => ({
    createTransport: jest.fn().mockReturnValue({
        sendMail: jest.fn().mockResolvedValue(true)
    })
}));

jest.mock("html-pdf-node", () => ({
    generatePdf: jest.fn().mockResolvedValue(Buffer.from("dummy pdf"))
}));

const request = require("supertest");
const app = require("../app");
const {
    prisma,
    seedTestData,
    cleanupTestData,
    disconnectPrisma,
    generateTestToken,
} = require("./setup");

let testData;
let doctorToken;
let createdVisitId; // stored across tests

beforeAll(async () => {
    await cleanupTestData();
    testData = await seedTestData();
    doctorToken = generateTestToken(testData.doctor.id, "DOCTOR");
});

afterAll(async () => {
    await cleanupTestData();
    await disconnectPrisma();
});

describe("POST /visits/create", () => {
    it("should create a new visit", async () => {
        const res = await request(app)
            .post("/visits/create")
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({ patientId: "PAT_TEST_001" });

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("visitId");
        expect(res.body.patientId).toBe(testData.patient.id);
        createdVisitId = res.body.visitId;
    });

    it("should return 404 for non-existent patient", async () => {
        const res = await request(app)
            .post("/visits/create")
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({ patientId: "NON_EXISTENT" });

        expect(res.statusCode).toBe(404);
    });
});

describe("PUT /visits/update/:visitId", () => {
    it("should update clinical details", async () => {
        const res = await request(app)
            .put(`/visits/update/${createdVisitId}`)
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({
                symptoms: "Toothache, sensitivity",
                diagnosis: "Dental caries",
                observations: "Cavity in lower molar",
                treatmentPlan: "Filling required",
                procedures: "Composite filling",
                followUpAdvice: "Avoid hard food for 24h",
                labTests: "X-ray",
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.symptoms).toBe("Toothache, sensitivity");
        expect(res.body.diagnosis).toBe("Dental caries");
    });

    it("should save medicines as JSON array", async () => {
        const medicines = JSON.stringify([
            { name: "Amoxicillin", dosage: "500mg", frequency: "3x daily", duration: "5 days" },
            { name: "Ibuprofen", dosage: "400mg", frequency: "2x daily", duration: "3 days" },
        ]);

        const res = await request(app)
            .put(`/visits/update/${createdVisitId}`)
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({ medicines });

        expect(res.statusCode).toBe(200);

        // Verify the stored JSON can be parsed back
        const parsed = JSON.parse(res.body.medicines);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].name).toBe("Amoxicillin");
        expect(parsed[1].dosage).toBe("400mg");
    });

    it("should return 404 for non-existent visit", async () => {
        const res = await request(app)
            .put("/visits/update/INVALID_VISIT")
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({ symptoms: "test" });

        expect(res.statusCode).toBe(404);
    });
});

describe("GET /visits/:visitId", () => {
    it("should return visit with patient data", async () => {
        const res = await request(app)
            .get(`/visits/${createdVisitId}`)
            .set("Authorization", `Bearer ${doctorToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.visitId).toBe(createdVisitId);
        expect(res.body.patient).toBeDefined();
        expect(res.body.patient.name).toBe("Test Patient");
        expect(res.body).toHaveProperty("previousPending");
    });

    it("should return 404 for invalid visit ID", async () => {
        const res = await request(app)
            .get("/visits/INVALID_VISIT_ID")
            .set("Authorization", `Bearer ${doctorToken}`);

        expect(res.statusCode).toBe(404);
    });
});

describe("GET /visits/history/:patientId", () => {
    it("should return patient visit history", async () => {
        const res = await request(app)
            .get("/visits/history/PAT_TEST_001")
            .set("Authorization", `Bearer ${doctorToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.visits).toBeDefined();
        expect(Array.isArray(res.body.visits)).toBe(true);
        expect(res.body.visits.length).toBeGreaterThanOrEqual(1);
    });
});

describe("POST /visits/close/:visitId", () => {
    it("should mark linked appointment as COMPLETED when visit is completed", async () => {
        const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const visitId = `VIS-TEST-CLOSE-${uniqueSuffix}`;
        const appointmentId = `APT-TEST-CLOSE-${uniqueSuffix}`;

        let createdVisit;

        try {
            createdVisit = await prisma.visit.create({
                data: {
                    visitId,
                    patientId: testData.patient.id,
                    doctorId: testData.doctor.id,
                    visitType: "NEW"
                }
            });

            await prisma.billing.create({
                data: {
                    billId: `BILL_TEST_CLOSE_${uniqueSuffix}`,
                    visitId: createdVisit.id,
                    previousPending: 0,
                    pendingCleared: 0,
                    updatedPending: 0,
                    currentCharges: 1200,
                    discount: 0,
                    totalAmount: 1200,
                    paidAmount: 1200,
                    pendingAmount: 0
                }
            });

            await prisma.appointment.create({
                data: {
                    appointmentId,
                    patientId: testData.patient.id,
                    doctorId: testData.doctor.id,
                    patientPhone: testData.patient.phone,
                    patientName: testData.patient.name,
                    patientAge: testData.patient.age,
                    patientGender: testData.patient.gender,
                    patientAddress: testData.patient.address,
                    scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
                    status: "CONFIRMED",
                    source: "FRONT_DESK",
                    linkedVisitId: visitId,
                    reason: "Visit close status sync test"
                }
            });

            const res = await request(app)
                .post(`/visits/close/${visitId}`)
                .set("Authorization", `Bearer ${doctorToken}`)
                .send({
                    isCompleted: true,
                    sendEmail: false
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe("COMPLETED");

            const updatedAppointment = await prisma.appointment.findUnique({
                where: { appointmentId },
                select: { status: true }
            });

            expect(updatedAppointment?.status).toBe("COMPLETED");
        } finally {
            await prisma.appointment.deleteMany({
                where: { appointmentId }
            });

            if (createdVisit) {
                await prisma.billing.deleteMany({
                    where: { visitId: createdVisit.id }
                });
            }

            await prisma.visit.deleteMany({
                where: { visitId }
            });
        }
    });
});

describe("POST /visits/send-report/:visitId", () => {
    it("should allow doctor to send report", async () => {
        const res = await request(app)
            .post(`/visits/send-report/${createdVisitId}`)
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({
                patientEmail: "test@example.com",
                sendEmail: true,
                patientPhone: "919999900001",
                sendWhatsApp: true
            });

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("emailSent");
        expect(res.body).toHaveProperty("whatsappSent");
    });

    it("should reject if access token is missing", async () => {
        const res = await request(app)
            .post(`/visits/send-report/${createdVisitId}`)
            .send({
                sendEmail: false,
                sendWhatsApp: false
            });

        expect(res.statusCode).toBe(401);
    });

    it("should return 404 for non-existent visit", async () => {
        const res = await request(app)
            .post("/visits/send-report/INVALID_VISIT")
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({
                sendEmail: false,
                sendWhatsApp: false
            });

        expect(res.statusCode).toBe(404);
    });
});

describe("DELETE /visits/:visitId", () => {
    let deleteVisitId;

    beforeAll(async () => {
        // Create a separate visit for delete testing
        const res = await request(app)
            .post("/visits/create")
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({ patientId: "PAT_TEST_001" });
        deleteVisitId = res.body.visitId;
    });

    it("should delete a non-completed visit", async () => {
        const res = await request(app)
            .delete(`/visits/${deleteVisitId}`)
            .set("Authorization", `Bearer ${doctorToken}`);

        expect(res.statusCode).toBe(204);
    });

    it("should return 404 for already deleted visit", async () => {
        const res = await request(app)
            .delete(`/visits/${deleteVisitId}`)
            .set("Authorization", `Bearer ${doctorToken}`);

        expect(res.statusCode).toBe(404);
    });
});
