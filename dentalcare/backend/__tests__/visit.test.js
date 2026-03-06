/**
 * Visit API tests
 */
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
